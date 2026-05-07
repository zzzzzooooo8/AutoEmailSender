from __future__ import annotations

import json
import hashlib
import re
from dataclasses import asdict, dataclass, field
from math import ceil
from time import perf_counter
from textwrap import dedent
from typing import TypeVar

import httpx
from bs4 import BeautifulSoup
from pydantic import BaseModel, Field, ValidationError

from app.core.config import get_settings
from app.models import IdentityMaterial, IdentityProfile, LLMProfile, Professor
from app.services.html_text import html_to_text
from app.services.mail_runtime import text_to_html
from app.services.rich_text import (
    normalize_email_html,
    render_rich_text_document,
    text_to_email_html,
)
from app.services.template_run_rewrite import (
    TemplateRunDocument,
    apply_template_run_replacements,
    build_template_run_document,
)


DEFAULT_BASE_URL = "https://api.openai.com/v1"
DEFAULT_LLM_TEMPERATURE = 0.2
DEFAULT_LLM_MAX_TOKENS = 6000
SYSTEM_MATCH_AND_DRAFT_PROMPT = dedent(
    """
    你是研究生套磁助理。你必须只输出 JSON，不要输出任何解释、Markdown 代码块或多余文字。
    JSON 字段必须包含：
    - match_score: 0-100 的整数
    - match_reason: 简洁中文说明
    - fit_points: 字符串数组
    - risk_points: 字符串数组
    - keywords: 字符串数组
    - subject: 邮件主题
    - rich_body: 受控富文本 JSON 正文
    - suggested_material_ids: 整数数组，只能从输入给出的可选材料 ID 中选择

    输出示例：
    {
      "match_score": 87,
      "match_reason": "研究方向与默认材料中的经历有明显交集。",
      "fit_points": ["信息抽取经历相关", "论文主题接近"],
      "risk_points": ["暂未体现具体合作问题"],
      "keywords": ["信息抽取", "大模型"],
      "subject": "申请与王老师交流科研方向",
      "rich_body": {
        "type": "doc",
        "blocks": [
          {
            "type": "paragraph",
            "children": [{"type": "text", "text": "王老师，您好："}]
          },
          {
            "type": "paragraph",
            "children": [{"type": "text", "text": "我是张三，正在关注您在信息抽取方向上的研究……"}]
          }
        ]
      },
      "suggested_material_ids": [12]
    }

    额外要求：
    - 只能输出一个 JSON 对象。
    - 不要省略字段。
    - rich_body 根节点必须是 {"type":"doc","blocks":[...]}。
    - blocks 只允许 paragraph、bullet_list、numbered_list。
    - 内联节点只允许 text、strong、emphasis、link、line_break。
    - link 的 href 只能使用 http、https、mailto。
    - fit_points、risk_points、keywords 即使为空也要输出数组。
    """
).strip()

SYSTEM_MATCH_ONLY_PROMPT = dedent(
    """
    你是研究生套磁助理。你必须只输出 JSON，不要输出任何解释、Markdown 代码块或多余文字。
    只做匹配分析，不要生成邮件草稿。

    JSON 字段必须包含：
    - match_score: 0-100 的整数
    - match_reason: 简洁中文说明
    - fit_points: 字符串数组
    - risk_points: 字符串数组
    - keywords: 字符串数组

    输出示例：
    {
      "match_score": 84,
      "match_reason": "导师方向与默认材料中的研究经历较匹配。",
      "fit_points": ["研究问题接近", "背景技能可迁移"],
      "risk_points": ["材料里缺少该导师近期方向的直接成果"],
      "keywords": ["多模态", "信息抽取"]
    }

    评分量表：
    match_score 总分为 100 分，由以下 4 个维度组成。你必须先按维度判断，再给出总分。

    1. 研究主题匹配度：0-45
       衡量默认材料与导师研究方向是否在研究问题、应用场景或领域上有交集。
       - 40-45：具体研究问题高度重合。
       - 30-39：同一方向，有明确交集。
       - 15-29：宽泛领域相关，但具体问题不同。
       - 1-14：只有弱相关背景。
       - 0：看不到相关性。

    2. 能力与方法匹配度：0-25
       衡量默认材料中的技能、方法、项目、论文或工具是否能支撑导师方向。
       - 21-25：能力可以直接支撑导师方向。
       - 13-20：有部分可迁移能力。
       - 5-12：只有基础背景或泛化能力。
       - 0：看不到支撑能力。

    3. 近期论文交集：0-20
       衡量导师近期论文与默认材料是否存在可引用、可展开的具体交集。
       - 16-20：近期论文主题与默认材料中的研究、项目或技能高度相关，可直接写入套磁理由。
       - 9-15：近期论文与默认材料有明确但不完全直接的交集。
       - 1-8：有近期论文，但与默认材料只有弱相关或泛化关联。
       - 0：没有近期论文，或近期论文与默认材料看不到有效交集。

    4. 个性化理由充分度：0-10
       衡量能否写出具体、可信、不空泛的套磁理由。
       - 8-10：能基于导师方向或论文提炼出具体匹配点。
       - 4-7：能写出合理但不够具体的理由。
       - 1-3：只能泛泛表达兴趣。
       - 0：无法形成可信理由。

    近期论文评分原则：
    - 有近期论文，且论文主题和默认材料有明确交集：应明显高于只有宽泛研究方向的导师。
    - 有近期论文，但论文和默认材料交集弱：不因论文数量多而加分。
    - 没有近期论文但研究方向具体：match_score 通常最高 80；只有在研究方向非常具体且默认材料高度重合时才可略高于 80，并必须说明理由。

    上限规则：
    - 没有近期论文，但研究方向具体：通常最高 80。
    - 没有近期论文，且研究方向很宽泛：match_score 最高 75。
    - 没有研究方向，但有近期论文：match_score 最高 85。
    - 研究方向和近期论文都缺失：match_score 最高 30。
    - 学生默认材料缺少可见研究、项目或技能证据：match_score 最高 60。
    - 触发上限规则时，risk_points 必须说明原因。

    额外要求：
    - 只能输出一个 JSON 对象。
    - 不要省略字段。
    - 数组字段即使为空也必须返回 []。
    - 只能基于默认材料与导师研究方向或近期论文中的可见证据评分。
    - 如果导师研究证据薄弱或与默认材料缺少直接交集，必须降低 match_score，并在 risk_points 中说明证据不足。
    """
).strip()

SYSTEM_DRAFT_PROMPT = dedent(
    """
    你是研究生套磁助理。你必须只输出 JSON，不要输出任何解释、Markdown 代码块或多余文字。
    你要基于用户提供的套磁信模板做“模板润色”，不要从零重写整封邮件。
    只生成邮件草稿，不要输出匹配分数。

    JSON 字段必须包含：
    - subject: 邮件主题
    - rich_body: 受控富文本 JSON 正文
    - suggested_material_ids: 整数数组，只能从输入给出的可选材料 ID 中选择

    输出示例：
    {
      "subject": "申请与李老师交流科研方向",
      "rich_body": {
        "type": "doc",
        "blocks": [
          {
            "type": "paragraph",
            "children": [{"type": "text", "text": "李老师，您好："}]
          },
          {
            "type": "paragraph",
            "children": [{"type": "text", "text": "我是张三，正在关注您在……"}]
          }
        ]
      },
      "suggested_material_ids": [8, 12]
    }

    额外要求：
    - 只能输出一个 JSON 对象。
    - 默认应保留模板的整体结构、段落顺序和主要话术风格；具体改写幅度以用户消息中的“草稿改写偏好”和“任务要求”为准。
    - 只允许改动：称呼、匹配理由、个性化一段、结尾、主题。
    - 必须围绕导师研究方向进行个性化改写，不能只写泛泛的“我关注您的研究”。
    - 不要从零重写整封邮件；即使偏好要求更强改写，也必须基于模板、导师信息和可见材料。
    - 尽量保留模板中可表达的富文本标记，例如加粗、斜体、链接和列表。
    - 如果模板包含表格，尽量保留其中的信息顺序和语义，但仍按允许的 rich_body 结构输出。
    - rich_body 根节点必须是 {"type":"doc","blocks":[...]}。
    - blocks 只允许 paragraph、bullet_list、numbered_list。
    - 内联节点只允许 text、strong、emphasis、link、line_break。
    - link 的 href 只能使用 http、https、mailto。
    - 如果没有合适材料，suggested_material_ids 返回 []。
    """
).strip()

SYSTEM_TEMPLATE_RUN_REWRITE_PROMPT = dedent(
    """
    你是研究生套磁邮件改写助理。你必须只输出 JSON。
    你不能输出 HTML、Markdown 或解释。
    你只能改写 body_segments 中已有 run 的 text。
    你不能新增、删除、合并、拆分或重排 segment/run。
    你不能修改任何格式、样式、表格结构或链接地址。
    占位符 token 例如 [[PH_1]] 必须留在原 run 中，不能改写、删除、新增或移动。

    JSON 字段必须包含：
    - subject: 邮件主题
    - replacements: segment 替换数组
    - suggested_material_ids: 整数数组，只能从可选材料 ID 中选择
    """
).strip()


class LLMRuntimeError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        request_url: str | None = None,
        attempted_urls: list[str] | None = None,
        endpoint_kind: str | None = None,
        status_code: int | None = None,
        duration_ms: int | None = None,
    ) -> None:
        super().__init__(message)
        self.request_url = request_url
        self.attempted_urls = attempted_urls or ([request_url] if request_url else [])
        self.endpoint_kind = endpoint_kind
        self.status_code = status_code
        self.duration_ms = duration_ms


@dataclass(slots=True)
class ChatCompletionUsage:
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    total_tokens: int | None = None
    cached_tokens: int | None = None


@dataclass(slots=True)
class ChatCompletionResult:
    content: str
    usage: ChatCompletionUsage | None = None
    request_url: str | None = None
    attempted_urls: list[str] = field(default_factory=list)
    endpoint_kind: str | None = None
    status_code: int | None = None
    duration_ms: int | None = None


@dataclass(slots=True)
class DraftTokenEstimate:
    estimated_prompt_tokens: int
    estimated_completion_tokens_upper_bound: int
    estimated_total_tokens_upper_bound: int


@dataclass(slots=True)
class MatchPromptParts:
    prompt: str
    stable_prefix: str
    prompt_hash: str
    stable_prefix_hash: str
    prompt_cache_key: str | None = None


class MatchAndDraftResult(BaseModel):
    match_score: int = Field(ge=0, le=100)
    match_reason: str
    fit_points: list[str] = Field(default_factory=list)
    risk_points: list[str] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)
    subject: str
    body_text: str | None = None
    body_html: str | None = None
    rich_body: dict[str, object] | None = None
    suggested_material_ids: list[int] = Field(default_factory=list)


class MatchEvaluationResult(BaseModel):
    match_score: int = Field(ge=0, le=100)
    match_reason: str
    fit_points: list[str] = Field(default_factory=list)
    risk_points: list[str] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)


class DraftGenerationResult(BaseModel):
    subject: str
    body_text: str | None = None
    body_html: str | None = None
    rich_body: dict[str, object] | None = None
    suggested_material_ids: list[int] = Field(default_factory=list)


class TemplateRunReplacement(BaseModel):
    run_id: str
    text: str


class TemplateSegmentReplacement(BaseModel):
    segment_id: str
    runs: list[TemplateRunReplacement] = Field(default_factory=list)


class TemplateRunRewriteResult(BaseModel):
    subject: str
    replacements: list[TemplateSegmentReplacement] = Field(default_factory=list)
    suggested_material_ids: list[int] = Field(default_factory=list)


@dataclass(slots=True)
class DraftRewritePreferences:
    draft_rewrite_intensity: str = "moderate"
    draft_rewrite_tone: str = "polite"
    draft_rewrite_formality: str = "balanced"
    draft_rewrite_length: str = "default"
    draft_rewrite_specificity: str = "balanced"
    draft_template_preservation: str = "structure_first"


class LLMProbeResult(BaseModel):
    ok: bool
    message: str
    resolved_base_url: str | None = None
    request_url: str | None = None
    attempted_urls: list[str] = Field(default_factory=list)
    endpoint_kind: str | None = None
    status_code: int | None = None
    duration_ms: int | None = None
    consumes_tokens: bool = True
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    total_tokens: int | None = None
    response_preview: str | None = None


class LLMModelCatalogResult(BaseModel):
    ok: bool
    message: str
    resolved_base_url: str | None = None
    request_url: str | None = None
    attempted_urls: list[str] = Field(default_factory=list)
    endpoint_kind: str | None = None
    status_code: int | None = None
    duration_ms: int | None = None
    consumes_tokens: bool = False
    models: list[str] = Field(default_factory=list)
    selected_model_available: bool | None = None


@dataclass(slots=True)
class GeneratedMatchAndDraft:
    result: MatchAndDraftResult
    usage: ChatCompletionUsage | None = None


@dataclass(slots=True)
class GeneratedMatchEvaluation:
    result: MatchEvaluationResult
    usage: ChatCompletionUsage | None = None
    request_url: str | None = None
    attempted_urls: list[str] = field(default_factory=list)
    endpoint_kind: str | None = None
    status_code: int | None = None
    duration_ms: int | None = None
    prompt_hash: str | None = None
    stable_prefix_hash: str | None = None
    prompt_cache_key: str | None = None


@dataclass(slots=True)
class GeneratedDraftContent:
    result: DraftGenerationResult
    usage: ChatCompletionUsage | None = None


DRAFT_REWRITE_INTENSITY_TEXT = {
    "light": "轻微，只做必要个性化，最大限度保留原文。",
    "moderate": "中等，在保留模板结构的基础上优化表达。",
    "strong": "明显，更主动地优化措辞和连接句，但不从零重写。",
}

DRAFT_REWRITE_TONE_TEXT = {
    "polite": "礼貌，更重视谦逊、尊重和边界感。",
    "professional": "专业，更突出研究表达和学术沟通。",
    "friendly": "亲和，表达更自然，减少生硬套话。",
}

DRAFT_REWRITE_FORMALITY_TEXT = {
    "natural": "更自然，句式更口语化，但保持礼貌。",
    "balanced": "默认，兼顾自然和正式。",
    "formal": "更正式，更接近正式学术邮件。",
}

DRAFT_REWRITE_LENGTH_TEXT = {
    "shorter": "更短，压缩冗余表达，避免过长段落。",
    "default": "默认，保持接近模板长度。",
    "more_detailed": "更详细，允许补充更具体的匹配理由，但不堆砌。",
}

DRAFT_REWRITE_SPECIFICITY_TEXT = {
    "concise": "概括，匹配理由更简洁。",
    "balanced": "平衡，兼顾简洁和具体。",
    "detailed": "细节更足，更强调导师方向、论文和材料经历的具体连接。",
}

DRAFT_TEMPLATE_PRESERVATION_TEXT = {
    "structure_first": "优先保留结构，尽量保持段落顺序和原有话术。",
    "balanced": "平衡，保留结构，同时允许优化表达。",
    "content_first": "更重内容表达，允许较多改写个性化内容，但仍不能从零重写。",
}

DRAFT_REWRITE_INTENSITY_REQUIREMENT_TEXT = {
    "light": "轻微，只做必要个性化和语句顺滑，最大限度保留原文。",
    "moderate": "中等，在保留模板骨架的基础上优化表达、连接句和个性化内容。",
    "strong": "明显，可以更主动优化措辞、连接句和个性化段，但必须基于模板与可见材料，不要从零重写。",
}

DRAFT_TEMPLATE_STRUCTURE_REQUIREMENT_TEXT = {
    "structure_first": "优先保留结构，保持段落顺序、信息顺序和主要话术。",
    "balanced": "平衡保留结构，可优化段落内部表达和句间衔接，但不改变模板骨架。",
    "content_first": "更重内容表达，允许在可改动范围内重排信息重心，但仍需保留模板骨架和原始沟通目的。",
}


StructuredResultT = TypeVar(
    "StructuredResultT",
    MatchAndDraftResult,
    MatchEvaluationResult,
    DraftGenerationResult,
    TemplateRunRewriteResult,
)


async def _legacy_probe_llm_profile(profile: LLMProfile) -> LLMProbeResult:
    base_url = resolve_base_url(profile.api_base_url)
    try:
        payload = {
            "model": profile.model_name,
            "messages": [
                {
                    "role": "user",
                    "content": "只回复 OK",
                },
            ],
            "temperature": 0,
            "max_tokens": min(profile.max_tokens or DEFAULT_LLM_MAX_TOKENS, 8),
        }
        if is_deepseek_profile(profile):
            payload["thinking"] = {"type": "disabled"}
        completion = await request_chat_completion(profile, payload)
    except LLMRuntimeError as exc:
        return LLMProbeResult(
            ok=False,
            message=str(exc),
            resolved_base_url=base_url,
            request_url=exc.request_url,
            attempted_urls=exc.attempted_urls,
            endpoint_kind=exc.endpoint_kind,
            response_preview=None,
        )

    preview = completion.content.strip().replace("\n", " ")[:200]
    return LLMProbeResult(
        ok=True,
        message="模型连通性测试成功",
        resolved_base_url=base_url,
        request_url=completion.request_url,
        attempted_urls=[completion.request_url] if completion.request_url else [],
        endpoint_kind=completion.endpoint_kind,
        response_preview=preview or None,
    )


async def generate_match_and_draft(
    *,
    identity: IdentityProfile,
    primary_material: IdentityMaterial | None,
    llm_profile: LLMProfile,
    professor: Professor,
    available_materials: list[IdentityMaterial],
    custom_subject: str | None = None,
    custom_body: str | None = None,
    custom_body_html: str | None = None,
    max_tokens: int | None = None,
) -> GeneratedMatchAndDraft:
    prompt = build_match_and_draft_prompt(
        identity=identity,
        primary_material=primary_material,
        professor=professor,
        available_materials=available_materials,
        custom_subject=custom_subject,
        custom_body=custom_body,
        custom_body_html=custom_body_html,
    )
    payload = {
        "model": llm_profile.model_name,
        "messages": [
            {
                "role": "system",
                "content": SYSTEM_MATCH_AND_DRAFT_PROMPT,
            },
            {
                "role": "user",
                "content": prompt,
            },
        ],
        "temperature": llm_profile.temperature if llm_profile.temperature is not None else DEFAULT_LLM_TEMPERATURE,
        "max_tokens": max_tokens or DEFAULT_LLM_MAX_TOKENS,
    }
    completion = await request_chat_completion(llm_profile, payload)

    result = parse_structured_result(completion.content, MatchAndDraftResult)

    valid_material_ids = {material.id for material in available_materials}
    result.suggested_material_ids = [
        material_id
        for material_id in result.suggested_material_ids
        if material_id in valid_material_ids
    ]
    return GeneratedMatchAndDraft(result=result, usage=completion.usage)


async def generate_match_evaluation(
    *,
    identity: IdentityProfile,
    primary_material: IdentityMaterial | None,
    llm_profile: LLMProfile,
    professor: Professor,
    available_materials: list[IdentityMaterial],
) -> GeneratedMatchEvaluation:
    prompt_parts = build_match_prompt_parts(
        identity=identity,
        primary_material=primary_material,
        professor=professor,
        available_materials=available_materials,
        llm_profile=llm_profile,
    )
    payload: dict[str, object] = {
        "model": llm_profile.model_name,
        "messages": [
            {
                "role": "system",
                "content": SYSTEM_MATCH_ONLY_PROMPT,
            },
            {
                "role": "user",
                "content": prompt_parts.prompt,
            },
        ],
        "temperature": 0,
        "max_tokens": llm_profile.max_tokens or DEFAULT_LLM_MAX_TOKENS,
    }
    if prompt_parts.prompt_cache_key:
        payload["prompt_cache_key"] = prompt_parts.prompt_cache_key

    completion = await request_chat_completion(
        llm_profile,
        payload,
    )
    result = parse_structured_result(completion.content, MatchEvaluationResult)
    return GeneratedMatchEvaluation(
        result=result,
        usage=completion.usage,
        request_url=completion.request_url,
        attempted_urls=completion.attempted_urls,
        endpoint_kind=completion.endpoint_kind,
        status_code=completion.status_code,
        duration_ms=completion.duration_ms,
        prompt_hash=prompt_parts.prompt_hash,
        stable_prefix_hash=prompt_parts.stable_prefix_hash,
        prompt_cache_key=prompt_parts.prompt_cache_key,
    )


async def generate_draft_content(
    *,
    identity: IdentityProfile,
    primary_material: IdentityMaterial | None,
    llm_profile: LLMProfile,
    professor: Professor,
    available_materials: list[IdentityMaterial],
    custom_subject: str | None = None,
    custom_body: str | None = None,
    custom_body_html: str | None = None,
    current_match: MatchEvaluationResult | None = None,
    max_tokens: int | None = None,
    rewrite_preferences: DraftRewritePreferences | None = None,
) -> GeneratedDraftContent:
    template_html = custom_body_html
    if not template_html and custom_body:
        template_html = text_to_email_html(custom_body).html

    if template_html:
        template_document = build_template_run_document(template_html)
        prompt = build_template_run_rewrite_prompt(
            identity=identity,
            primary_material=primary_material,
            professor=professor,
            available_materials=available_materials,
            subject_template=custom_subject,
            template_document=template_document,
            current_match=current_match,
            rewrite_preferences=rewrite_preferences,
        )
        completion = await request_chat_completion(
            llm_profile,
            {
                "model": llm_profile.model_name,
                "messages": [
                    {
                        "role": "system",
                        "content": SYSTEM_TEMPLATE_RUN_REWRITE_PROMPT,
                    },
                    {
                        "role": "user",
                        "content": prompt,
                    },
                ],
                "temperature": llm_profile.temperature if llm_profile.temperature is not None else DEFAULT_LLM_TEMPERATURE,
                "max_tokens": max_tokens or DEFAULT_LLM_MAX_TOKENS,
            },
        )
        rewrite_result = parse_structured_result(completion.content, TemplateRunRewriteResult)
        try:
            rendered = apply_template_run_replacements(
                template_document,
                [item.model_dump() for item in rewrite_result.replacements],
            )
        except ValueError as exc:
            raise LLMRuntimeError(str(exc)) from exc
        valid_material_ids = {material.id for material in available_materials}
        return GeneratedDraftContent(
            result=DraftGenerationResult(
                subject=rewrite_result.subject,
                body_text=rendered.text,
                body_html=rendered.html,
                suggested_material_ids=[
                    material_id
                    for material_id in rewrite_result.suggested_material_ids
                    if material_id in valid_material_ids
                ],
            ),
            usage=completion.usage,
        )

    prompt = build_draft_prompt(
        identity=identity,
        primary_material=primary_material,
        professor=professor,
        available_materials=available_materials,
        custom_subject=custom_subject,
        custom_body=custom_body,
        custom_body_html=custom_body_html,
        current_match=current_match,
        rewrite_preferences=rewrite_preferences,
    )
    completion = await request_chat_completion(
        llm_profile,
        {
            "model": llm_profile.model_name,
            "messages": [
                {
                    "role": "system",
                    "content": SYSTEM_DRAFT_PROMPT,
                },
                {
                    "role": "user",
                    "content": prompt,
                },
            ],
            "temperature": llm_profile.temperature if llm_profile.temperature is not None else DEFAULT_LLM_TEMPERATURE,
            "max_tokens": max_tokens or DEFAULT_LLM_MAX_TOKENS,
        },
    )
    result = parse_structured_result(completion.content, DraftGenerationResult)
    valid_material_ids = {material.id for material in available_materials}
    result.suggested_material_ids = [
        material_id
        for material_id in result.suggested_material_ids
        if material_id in valid_material_ids
    ]
    return GeneratedDraftContent(result=result, usage=completion.usage)


async def _legacy_request_chat_completion(
    profile: LLMProfile,
    payload: dict[str, object],
) -> ChatCompletionResult:
    base_url = resolve_base_url(profile.api_base_url)
    timeout_seconds = get_settings().llm_request_timeout_seconds
    timeout = httpx.Timeout(timeout_seconds)
    headers = {
        "Authorization": f"Bearer {profile.api_key}",
        "Content-Type": "application/json",
    }
    attempts = [
        (
            "chat_completions",
            build_endpoint_url(base_url, "chat/completions"),
            payload,
            extract_chat_completion_content,
        ),
        (
            "responses",
            build_endpoint_url(base_url, "responses"),
            build_responses_payload(payload),
            extract_responses_content,
        ),
    ]
    attempted_urls: list[str] = []
    previous_failures: list[str] = []

    for index, (endpoint_kind, url, request_body, content_extractor) in enumerate(attempts):
        attempted_urls.append(url)
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.post(url, headers=headers, json=request_body)
        except httpx.TimeoutException as exc:
            raise LLMRuntimeError(
                f"模型请求超时（{timeout_seconds} 秒）",
                request_url=url,
                attempted_urls=attempted_urls.copy(),
                endpoint_kind=endpoint_kind,
            ) from exc
        except httpx.HTTPError as exc:
            raise LLMRuntimeError(
                f"模型请求失败: {exc}",
                request_url=url,
                attempted_urls=attempted_urls.copy(),
                endpoint_kind=endpoint_kind,
            ) from exc

        if response.status_code == 404 and index < len(attempts) - 1:
            previous_failures.append(format_http_error(response.status_code, response.text, url))
            continue

        if response.status_code >= 400:
            message = format_http_error(response.status_code, response.text, url)
            if previous_failures:
                message = f"{message}；此前已尝试：{'；'.join(previous_failures)}"
            raise LLMRuntimeError(
                message,
                request_url=url,
                attempted_urls=attempted_urls.copy(),
                endpoint_kind=endpoint_kind,
            )

        try:
            data = response.json()
            content = content_extractor(data)
        except (KeyError, IndexError, TypeError, ValueError) as exc:
            raise LLMRuntimeError(
                "模型响应缺少可解析的文本内容",
                request_url=url,
                attempted_urls=attempted_urls.copy(),
                endpoint_kind=endpoint_kind,
            ) from exc

        if not isinstance(content, str) or not content.strip():
            raise LLMRuntimeError(
                "模型返回了空内容",
                request_url=url,
                attempted_urls=attempted_urls.copy(),
                endpoint_kind=endpoint_kind,
            )

        return ChatCompletionResult(
            content=content,
            usage=parse_completion_usage(data.get("usage")),
            request_url=url,
            endpoint_kind=endpoint_kind,
        )

    raise LLMRuntimeError(
        "模型请求失败",
        request_url=attempted_urls[-1] if attempted_urls else None,
        attempted_urls=attempted_urls,
    )


async def probe_llm_profile(profile: LLMProfile) -> LLMProbeResult:
    base_url = resolve_base_url(profile.api_base_url)
    try:
        payload = {
            "model": profile.model_name,
            "messages": [
                {
                    "role": "user",
                    "content": "只回复 OK",
                },
            ],
            "temperature": 0,
            "max_tokens": min(profile.max_tokens or DEFAULT_LLM_MAX_TOKENS, 8),
        }
        if is_deepseek_profile(profile):
            payload["thinking"] = {"type": "disabled"}
        completion = await request_chat_completion(profile, payload)
    except LLMRuntimeError as exc:
        return LLMProbeResult(
            ok=False,
            message=str(exc),
            resolved_base_url=base_url,
            request_url=exc.request_url,
            attempted_urls=exc.attempted_urls,
            endpoint_kind=exc.endpoint_kind,
            status_code=exc.status_code,
            duration_ms=exc.duration_ms,
            consumes_tokens=True,
            response_preview=None,
        )

    preview = completion.content.strip().replace("\n", " ")[:200]
    return LLMProbeResult(
        ok=True,
        message="模型可用性测试成功",
        resolved_base_url=base_url,
        request_url=completion.request_url,
        attempted_urls=completion.attempted_urls,
        endpoint_kind=completion.endpoint_kind,
        status_code=completion.status_code,
        duration_ms=completion.duration_ms,
        consumes_tokens=True,
        prompt_tokens=completion.usage.prompt_tokens if completion.usage else None,
        completion_tokens=completion.usage.completion_tokens if completion.usage else None,
        total_tokens=completion.usage.total_tokens if completion.usage else None,
        response_preview=preview or None,
    )


async def fetch_llm_profile_models(profile: LLMProfile) -> LLMModelCatalogResult:
    base_url = resolve_base_url(profile.api_base_url)
    timeout_seconds = get_settings().llm_request_timeout_seconds
    timeout = httpx.Timeout(timeout_seconds)
    headers = {
        "Authorization": f"Bearer {profile.api_key}",
        "Content-Type": "application/json",
    }
    url = build_endpoint_url(base_url, "models")
    start = perf_counter()

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(url, headers=headers)
    except httpx.TimeoutException:
        return LLMModelCatalogResult(
            ok=False,
            message=f"获取模型列表超时（{timeout_seconds} 秒）",
            resolved_base_url=base_url,
            request_url=url,
            attempted_urls=[url],
            endpoint_kind="models",
            duration_ms=compute_duration_ms(start),
            consumes_tokens=False,
        )
    except httpx.HTTPError as exc:
        return LLMModelCatalogResult(
            ok=False,
            message=f"获取模型列表失败: {exc}",
            resolved_base_url=base_url,
            request_url=url,
            attempted_urls=[url],
            endpoint_kind="models",
            duration_ms=compute_duration_ms(start),
            consumes_tokens=False,
        )

    duration_ms = compute_duration_ms(start)
    if response.status_code >= 400:
        return LLMModelCatalogResult(
            ok=False,
            message=format_http_error(response.status_code, response.text, url),
            resolved_base_url=base_url,
            request_url=url,
            attempted_urls=[url],
            endpoint_kind="models",
            status_code=response.status_code,
            duration_ms=duration_ms,
            consumes_tokens=False,
        )

    try:
        data = response.json()
        models = extract_model_ids(data)
    except (TypeError, ValueError) as exc:
        return LLMModelCatalogResult(
            ok=False,
            message=f"模型列表返回格式无法解析: {exc}",
            resolved_base_url=base_url,
            request_url=url,
            attempted_urls=[url],
            endpoint_kind="models",
            status_code=response.status_code,
            duration_ms=duration_ms,
            consumes_tokens=False,
        )

    selected_model_available = profile.model_name in models if profile.model_name else None
    message = f"已获取 {len(models)} 个模型"
    if profile.model_name:
        if selected_model_available:
            message = f"{message}，当前模型已在列表中"
        else:
            message = f"{message}，但当前模型不在列表中"

    return LLMModelCatalogResult(
        ok=True,
        message=message,
        resolved_base_url=base_url,
        request_url=url,
        attempted_urls=[url],
        endpoint_kind="models",
        status_code=response.status_code,
        duration_ms=duration_ms,
        consumes_tokens=False,
        models=models,
        selected_model_available=selected_model_available,
    )


async def request_chat_completion(
    profile: LLMProfile,
    payload: dict[str, object],
) -> ChatCompletionResult:
    base_url = resolve_base_url(profile.api_base_url)
    timeout_seconds = get_settings().llm_request_timeout_seconds
    timeout = httpx.Timeout(timeout_seconds)
    headers = {
        "Authorization": f"Bearer {profile.api_key}",
        "Content-Type": "application/json",
    }
    attempts = [
        (
            "chat_completions",
            build_endpoint_url(base_url, "chat/completions"),
            payload,
            extract_chat_completion_content,
        ),
        (
            "responses",
            build_endpoint_url(base_url, "responses"),
            build_responses_payload(payload),
            extract_responses_content,
        ),
    ]
    attempted_urls: list[str] = []
    previous_failures: list[str] = []

    for index, (endpoint_kind, url, request_body, content_extractor) in enumerate(attempts):
        attempted_urls.append(url)
        start = perf_counter()
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.post(url, headers=headers, json=request_body)
        except httpx.TimeoutException as exc:
            raise LLMRuntimeError(
                f"模型请求超时（{timeout_seconds} 秒）",
                request_url=url,
                attempted_urls=attempted_urls.copy(),
                endpoint_kind=endpoint_kind,
                duration_ms=compute_duration_ms(start),
            ) from exc
        except httpx.HTTPError as exc:
            raise LLMRuntimeError(
                f"模型请求失败: {exc}",
                request_url=url,
                attempted_urls=attempted_urls.copy(),
                endpoint_kind=endpoint_kind,
                duration_ms=compute_duration_ms(start),
            ) from exc

        duration_ms = compute_duration_ms(start)
        if response.status_code == 404 and index < len(attempts) - 1:
            previous_failures.append(format_http_error(response.status_code, response.text, url))
            continue

        if response.status_code >= 400:
            message = format_http_error(response.status_code, response.text, url)
            if previous_failures:
                message = f"{message}；此前已尝试：{'；'.join(previous_failures)}"
            raise LLMRuntimeError(
                message,
                request_url=url,
                attempted_urls=attempted_urls.copy(),
                endpoint_kind=endpoint_kind,
                status_code=response.status_code,
                duration_ms=duration_ms,
            )

        try:
            data = response.json()
            content = content_extractor(data)
        except (KeyError, IndexError, TypeError, ValueError) as exc:
            raise LLMRuntimeError(
                "模型响应缺少可解析的文本内容",
                request_url=url,
                attempted_urls=attempted_urls.copy(),
                endpoint_kind=endpoint_kind,
                status_code=response.status_code,
                duration_ms=duration_ms,
            ) from exc

        if not isinstance(content, str) or not content.strip():
            raise LLMRuntimeError(
                "模型返回了空内容",
                request_url=url,
                attempted_urls=attempted_urls.copy(),
                endpoint_kind=endpoint_kind,
                status_code=response.status_code,
                duration_ms=duration_ms,
            )

        return ChatCompletionResult(
            content=content,
            usage=parse_completion_usage(data.get("usage")),
            request_url=url,
            attempted_urls=attempted_urls.copy(),
            endpoint_kind=endpoint_kind,
            status_code=response.status_code,
            duration_ms=duration_ms,
        )

    raise LLMRuntimeError(
        "模型请求失败",
        request_url=attempted_urls[-1] if attempted_urls else None,
        attempted_urls=attempted_urls,
    )


def estimate_match_and_draft_tokens(
    *,
    identity: IdentityProfile,
    primary_material: IdentityMaterial | None,
    llm_profile: LLMProfile,
    professor: Professor,
    available_materials: list[IdentityMaterial],
    custom_subject: str | None = None,
    custom_body: str | None = None,
    custom_body_html: str | None = None,
    max_tokens: int | None = None,
) -> DraftTokenEstimate:
    prompt = build_match_and_draft_prompt(
        identity=identity,
        primary_material=primary_material,
        professor=professor,
        available_materials=available_materials,
        custom_subject=custom_subject,
        custom_body=custom_body,
        custom_body_html=custom_body_html,
    )
    estimated_prompt_tokens = estimate_text_tokens(f"{SYSTEM_MATCH_AND_DRAFT_PROMPT}\n{prompt}")
    estimated_completion_tokens_upper_bound = max_tokens or DEFAULT_LLM_MAX_TOKENS
    return DraftTokenEstimate(
        estimated_prompt_tokens=estimated_prompt_tokens,
        estimated_completion_tokens_upper_bound=estimated_completion_tokens_upper_bound,
        estimated_total_tokens_upper_bound=(
            estimated_prompt_tokens + estimated_completion_tokens_upper_bound
        ),
    )


def estimate_template_run_draft_tokens(
    *,
    identity: IdentityProfile,
    primary_material: IdentityMaterial | None,
    llm_profile: LLMProfile,
    professor: Professor,
    available_materials: list[IdentityMaterial],
    custom_subject: str | None = None,
    custom_body: str | None = None,
    custom_body_html: str | None = None,
    max_tokens: int | None = None,
) -> DraftTokenEstimate:
    template_html = custom_body_html
    if not template_html and custom_body:
        template_html = text_to_email_html(custom_body).html

    if template_html:
        document = build_template_run_document(template_html)
        prompt = build_template_run_rewrite_prompt(
            identity=identity,
            primary_material=primary_material,
            professor=professor,
            available_materials=available_materials,
            subject_template=custom_subject,
            template_document=document,
            current_match=None,
            rewrite_preferences=DraftRewritePreferences(),
        )
        estimated_prompt_tokens = estimate_text_tokens(
            f"{SYSTEM_TEMPLATE_RUN_REWRITE_PROMPT}\n{prompt}",
        )
    else:
        prompt = build_draft_prompt(
            identity=identity,
            primary_material=primary_material,
            professor=professor,
            available_materials=available_materials,
            custom_subject=custom_subject,
            custom_body=custom_body,
            custom_body_html=custom_body_html,
            current_match=None,
            rewrite_preferences=DraftRewritePreferences(),
        )
        estimated_prompt_tokens = estimate_text_tokens(f"{SYSTEM_DRAFT_PROMPT}\n{prompt}")

    estimated_completion_tokens_upper_bound = max_tokens or DEFAULT_LLM_MAX_TOKENS
    return DraftTokenEstimate(
        estimated_prompt_tokens=estimated_prompt_tokens,
        estimated_completion_tokens_upper_bound=estimated_completion_tokens_upper_bound,
        estimated_total_tokens_upper_bound=(
            estimated_prompt_tokens + estimated_completion_tokens_upper_bound
        ),
    )


def build_match_prompt(
    *,
    identity: IdentityProfile,
    primary_material: IdentityMaterial | None,
    professor: Professor,
    available_materials: list[IdentityMaterial],
) -> str:
    return build_match_prompt_parts(
        identity=identity,
        primary_material=primary_material,
        professor=professor,
        available_materials=available_materials,
    ).prompt


def build_match_prompt_parts(
    *,
    identity: IdentityProfile,
    primary_material: IdentityMaterial | None,
    professor: Professor,
    available_materials: list[IdentityMaterial],
    llm_profile: LLMProfile | None = None,
) -> MatchPromptParts:
    sorted_materials = sorted(available_materials, key=lambda material: material.id or 0)
    material_block = "\n".join(
        f"- id={material.id}, name={_format_nullable(material.display_name)}, type={_format_nullable(material.material_type)}"
        for material in sorted_materials
    )
    primary_material_text = (primary_material.extracted_text if primary_material else "") or ""
    if len(primary_material_text) > 5000:
        primary_material_text = f"{primary_material_text[:5000]}\n...(已截断)"

    stable_prefix = dedent(
        f"""
        任务要求：
        1. 只判断匹配度，不要生成邮件草稿。
        2. match_reason 要简洁但具体。
        3. fit_points / risk_points / keywords 尽量聚焦，不要泛泛而谈。

        当前发送身份：
        - 姓名：{_format_nullable(identity.name)}
        - 发件邮箱：{_format_nullable(identity.email_address)}
        - 默认语言：{_format_nullable(identity.default_language)}
        - 匹配阈值：{identity.match_threshold if identity.match_threshold is not None else "未设置"}

        默认材料：
        - 名称：{_format_nullable(primary_material.display_name if primary_material else None)}
        - 标签：{_format_nullable(primary_material.material_type if primary_material else None)}

        默认材料文本：
        {primary_material_text or "未上传可提取文本的默认材料"}

        可选材料：
        {material_block or "- 无可用材料"}
        """
    ).strip()

    professor_papers = "\n".join(f"- {paper}" for paper in (professor.recent_papers or []))
    dynamic_suffix = dedent(
        f"""
        导师信息：
        - 姓名：{_format_nullable(professor.name)}
        - 邮箱：{_format_nullable(professor.email)}
        - 职称：{_format_nullable(professor.title)}
        - 学校：{_format_nullable(professor.university)}
        - 学院：{_format_nullable(professor.school)}
        - 院系：{_format_nullable(professor.department)}
        - 研究方向：{_format_nullable(professor.research_direction)}
        - 主页：{_format_nullable(professor.profile_url)}
        - 近期论文：
        {professor_papers or "- 无"}
        """
    ).strip()
    prompt = f"{stable_prefix}\n\n{dynamic_suffix}"
    return MatchPromptParts(
        prompt=prompt,
        stable_prefix=stable_prefix,
        prompt_hash=_hash_prompt(prompt),
        stable_prefix_hash=_hash_prompt(stable_prefix),
        prompt_cache_key=(
            _build_match_prompt_cache_key(
                identity=identity,
                primary_material=primary_material,
                llm_profile=llm_profile,
            )
            if llm_profile is not None
            else None
        ),
    )


def build_draft_prompt(
    *,
    identity: IdentityProfile,
    primary_material: IdentityMaterial | None,
    professor: Professor,
    available_materials: list[IdentityMaterial],
    custom_subject: str | None,
    custom_body: str | None,
    current_match: MatchEvaluationResult | None,
    custom_body_html: str | None = None,
    rewrite_preferences: DraftRewritePreferences | None = None,
) -> str:
    match_context = ""
    if current_match is not None:
        match_context = dedent(
            f"""
            当前已知匹配信息：
            - match_score: {current_match.match_score}
            - match_reason: {current_match.match_reason}
            - fit_points: {current_match.fit_points}
            - risk_points: {current_match.risk_points}
            - keywords: {current_match.keywords}
            """
        ).strip()
    rewrite_preferences = rewrite_preferences or DraftRewritePreferences()
    rewrite_preferences_block = build_draft_rewrite_preferences(rewrite_preferences)
    rewrite_constraints_block = build_draft_rewrite_constraints(rewrite_preferences)

    return _build_base_generation_prompt(
        identity=identity,
        primary_material=primary_material,
        professor=professor,
        available_materials=available_materials,
        custom_subject=custom_subject,
        custom_body=custom_body,
        custom_body_html=custom_body_html,
        extra_requirements=f"""
        {match_context or "当前还没有单独计算过匹配，请你自己综合判断邮件内容。"}

        {rewrite_preferences_block}

        {rewrite_constraints_block}

        任务要求：
        1. 必须以提供的套磁信模板为基础润色，不要从零重写。
        2. 只允许改动：称呼、匹配理由、个性化一段、结尾、主题。
        3. 遵循上面的模板结构要求，不要突破模板骨架和原始沟通目的。
        4. 只生成邮件草稿，不要输出 match_score 等匹配字段。
        5. 用中文生成专业、克制、具体的套磁邮件。
        6. rich_body 必须是可渲染为邮件正文的受控富文本 JSON。
        7. suggested_material_ids 只能返回可选材料里存在的 id。
        8. 必须围绕导师研究方向进行个性化改写，研究方向来自“导师信息 - 研究方向”。
        9. 按上面的改写幅度要求控制改动大小，同时尽量保留可表达的富文本标记，例如加粗、斜体、链接和列表。
        10. 如果模板包含表格，保留表格中的信息顺序和语义，但不要输出 schema 不支持的表格节点。
        """,
        current_match=current_match,
    )


def build_template_run_rewrite_prompt(
    *,
    identity: IdentityProfile,
    primary_material: IdentityMaterial | None,
    professor: Professor,
    available_materials: list[IdentityMaterial],
    subject_template: str | None,
    template_document: TemplateRunDocument,
    current_match: MatchEvaluationResult | None,
    rewrite_preferences: DraftRewritePreferences | None,
) -> str:
    primary_material_text = (primary_material.extracted_text if primary_material else "") or ""
    if len(primary_material_text) > 5000:
        primary_material_text = f"{primary_material_text[:5000]}\n...(已截断)"

    payload = {
        "task": "rewrite_email_template_runs",
        "context": {
            "identity": {
                "name": _format_nullable(identity.name),
                "email_address": _format_nullable(identity.email_address),
                "default_language": _format_nullable(identity.default_language),
                "match_threshold": identity.match_threshold,
            },
            "professor": {
                "name": _format_nullable(professor.name),
                "email": _format_nullable(professor.email),
                "title": _format_nullable(professor.title),
                "university": _format_nullable(professor.university),
                "school": _format_nullable(professor.school),
                "department": _format_nullable(professor.department),
                "research_direction": _format_nullable(professor.research_direction),
                "profile_url": _format_nullable(professor.profile_url),
                "recent_papers": professor.recent_papers or [],
            },
            "student": {
                "primary_material": {
                    "id": primary_material.id if primary_material else None,
                    "name": _format_nullable(primary_material.display_name if primary_material else None),
                    "type": _format_nullable(primary_material.material_type if primary_material else None),
                    "extracted_text": primary_material_text,
                },
            },
            "current_match": current_match.model_dump() if current_match is not None else None,
            "rewrite_preferences": asdict(rewrite_preferences or DraftRewritePreferences()),
        },
        "subject_template": subject_template or "",
        "body_segments": [
            {
                "segment_id": segment.segment_id,
                "role": segment.role,
                "runs": [
                    {
                        "run_id": run.run_id,
                        "text": run.text,
                        "marks": run.marks,
                        "locked_placeholders": run.locked_placeholders,
                    }
                    for run in segment.runs
                ],
            }
            for segment in template_document.segments
        ],
        "available_materials": [
            {
                "id": material.id,
                "name": _format_nullable(material.display_name),
                "type": _format_nullable(material.material_type),
            }
            for material in available_materials
        ],
        "instructions": [
            "只返回 JSON 对象。",
            "只改写 replacements 中已有 run 的 text。",
            "segment_id 和 run_id 必须来自 body_segments。",
            "不要返回 HTML 或完整正文。",
            "locked_placeholders 中的 token 必须保留在同一个 run 内。",
            "suggested_material_ids 只能选择 available_materials 中存在的 id。",
        ],
    }
    return json.dumps(payload, ensure_ascii=False, indent=2)


def build_draft_rewrite_constraints(preferences: DraftRewritePreferences) -> str:
    intensity = DRAFT_REWRITE_INTENSITY_REQUIREMENT_TEXT.get(
        preferences.draft_rewrite_intensity,
        DRAFT_REWRITE_INTENSITY_REQUIREMENT_TEXT["moderate"],
    )
    preservation = DRAFT_TEMPLATE_STRUCTURE_REQUIREMENT_TEXT.get(
        preferences.draft_template_preservation,
        DRAFT_TEMPLATE_STRUCTURE_REQUIREMENT_TEXT["structure_first"],
    )
    return dedent(
        f"""
        改写执行边界：
        - 改写幅度要求：{intensity}
        - 模板结构要求：{preservation}
        """
    ).strip()


def build_draft_rewrite_preferences(preferences: DraftRewritePreferences | None) -> str:
    preferences = preferences or DraftRewritePreferences()
    intensity = DRAFT_REWRITE_INTENSITY_TEXT.get(
        preferences.draft_rewrite_intensity,
        DRAFT_REWRITE_INTENSITY_TEXT["moderate"],
    )
    tone = DRAFT_REWRITE_TONE_TEXT.get(
        preferences.draft_rewrite_tone,
        DRAFT_REWRITE_TONE_TEXT["polite"],
    )
    formality = DRAFT_REWRITE_FORMALITY_TEXT.get(
        preferences.draft_rewrite_formality,
        DRAFT_REWRITE_FORMALITY_TEXT["balanced"],
    )
    length = DRAFT_REWRITE_LENGTH_TEXT.get(
        preferences.draft_rewrite_length,
        DRAFT_REWRITE_LENGTH_TEXT["default"],
    )
    specificity = DRAFT_REWRITE_SPECIFICITY_TEXT.get(
        preferences.draft_rewrite_specificity,
        DRAFT_REWRITE_SPECIFICITY_TEXT["balanced"],
    )
    preservation = DRAFT_TEMPLATE_PRESERVATION_TEXT.get(
        preferences.draft_template_preservation,
        DRAFT_TEMPLATE_PRESERVATION_TEXT["structure_first"],
    )
    return dedent(
        f"""
        草稿改写偏好：
        - 改写强度：{intensity}
        - 语气：{tone}
        - 正式程度：{formality}
        - 长度：{length}
        - 具体性：{specificity}
        - 模板保留度：{preservation}

        这些偏好只影响表达方式，不得覆盖系统要求、JSON 输出结构、富文本 schema、模板保留边界和导师研究方向个性化要求。
        """
    ).strip()


def build_match_and_draft_prompt(
    *,
    identity: IdentityProfile,
    primary_material: IdentityMaterial | None,
    professor: Professor,
    available_materials: list[IdentityMaterial],
    custom_subject: str | None,
    custom_body: str | None,
    custom_body_html: str | None = None,
) -> str:
    return _build_base_generation_prompt(
        identity=identity,
        primary_material=primary_material,
        professor=professor,
        available_materials=available_materials,
        custom_subject=custom_subject,
        custom_body=custom_body,
        custom_body_html=custom_body_html,
        extra_requirements="""
        任务要求：
        1. 先根据默认材料和导师方向判断匹配度。
        2. 用中文生成专业、克制、具体的套磁邮件。
        3. rich_body 必须是可渲染为邮件正文的受控富文本 JSON。
        4. suggested_material_ids 只能返回可选材料里存在的 id。
        """,
        current_match=None,
    )


def _build_base_generation_prompt(
    *,
    identity: IdentityProfile,
    primary_material: IdentityMaterial | None,
    professor: Professor,
    available_materials: list[IdentityMaterial],
    custom_subject: str | None,
    custom_body: str | None,
    extra_requirements: str,
    current_match: MatchEvaluationResult | None,
    custom_body_html: str | None = None,
) -> str:
    material_block = "\n".join(
        f"- id={material.id}, name={material.display_name}, type={material.material_type}"
        for material in available_materials
    )
    primary_material_text = (primary_material.extracted_text if primary_material else "") or ""
    if len(primary_material_text) > 5000:
        primary_material_text = f"{primary_material_text[:5000]}\n...(已截断)"

    professor_papers = "\n".join(f"- {paper}" for paper in (professor.recent_papers or []))
    current_match_block = ""
    if current_match is not None:
        current_match_block = dedent(
            f"""

            当前已知匹配信息：
            - 匹配分数：{current_match.match_score}
            - 匹配说明：{current_match.match_reason}
            - 匹配亮点：{current_match.fit_points}
            - 风险提示：{current_match.risk_points}
            - 关键词：{current_match.keywords}
            """
        )
    return dedent(
        f"""
        当前发送身份：
        - 姓名：{identity.name}
        - 发件邮箱：{identity.email_address}
        - 默认语言：{identity.default_language}
        - 匹配阈值：{identity.match_threshold if identity.match_threshold is not None else "未设置"}

        当前默认材料：
        - 名称：{primary_material.display_name if primary_material else "未设置"}
        - 标签：{primary_material.material_type if primary_material else "未设置"}

        当前默认材料文本：
        {primary_material_text or "未上传可提取文本的默认材料"}

        导师信息：
        - 姓名：{professor.name}
        - 邮箱：{professor.email or "未知"}
        - 职称：{professor.title or "未知"}
        - 学校：{professor.university or "未知"}
        - 学院：{professor.school or "未知"}
        - 院系：{professor.department or "未知"}
        - 研究方向：{professor.research_direction or "未知"}
        - 主页：{professor.profile_url or "未知"}
        - 近期论文：
        {professor_papers or "- 无"}

        可选材料：
        {material_block or "- 无可用材料"}

        套磁信模板主题：{custom_subject or "无"}
        套磁信模板正文：{custom_body or "无"}
        {current_match_block}

        {dedent(extra_requirements).strip()}
        """
    ).strip()


def resolve_template_text(
    body_text: str | None,
    body_html: str | None,
) -> str | None:
    normalized_body_text = (body_text or "").strip()
    if normalized_body_text:
        return normalized_body_text

    normalized_body_html = (body_html or "").strip()
    if not normalized_body_html:
        return None

    extracted_text = html_to_text(normalized_body_html)
    return extracted_text or None


def _hash_prompt(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _format_nullable(value: object) -> str:
    if value is None:
        return "未知"
    if isinstance(value, str):
        return value.strip() or "未知"
    return str(value)


def _is_official_openai_profile(profile: LLMProfile) -> bool:
    if profile.provider != "openai":
        return False
    return resolve_base_url(profile.api_base_url).rstrip("/") == DEFAULT_BASE_URL


def _build_match_prompt_cache_key(
    *,
    identity: IdentityProfile,
    primary_material: IdentityMaterial | None,
    llm_profile: LLMProfile,
) -> str | None:
    if not _is_official_openai_profile(llm_profile):
        return None
    material_id = primary_material.id if primary_material is not None else "none"
    return f"match:v1:{identity.id}:{material_id}:{llm_profile.id}"


def extract_json_object(raw_text: str) -> str:
    text = raw_text.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        if len(lines) >= 3:
            text = "\n".join(lines[1:-1]).strip()

    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise LLMRuntimeError("模型未返回 JSON 对象")
    return text[start : end + 1]


def parse_structured_result(
    raw_text: str,
    result_model: type[StructuredResultT],
) -> StructuredResultT:
    try:
        data = json.loads(extract_json_object(raw_text))
        result = result_model.model_validate(data)
    except (json.JSONDecodeError, ValidationError) as exc:
        raise LLMRuntimeError(f"模型返回的 JSON 结构无效: {exc}") from exc

    if isinstance(result, MatchAndDraftResult):
        return _normalize_match_and_draft_result(result)  # type: ignore[return-value]
    if isinstance(result, MatchEvaluationResult):
        return _normalize_match_evaluation_result(result)  # type: ignore[return-value]
    if isinstance(result, TemplateRunRewriteResult):
        result.subject = _normalize_text_field(result.subject, "subject")
        result.suggested_material_ids = _normalize_integer_list(result.suggested_material_ids)
        return result  # type: ignore[return-value]
    if isinstance(result, DraftGenerationResult):
        return _normalize_draft_generation_result(result)  # type: ignore[return-value]
    return result


def resolve_base_url(api_base_url: str | None) -> str:
    return (api_base_url or DEFAULT_BASE_URL).strip().rstrip("/")


def is_deepseek_profile(profile: LLMProfile) -> bool:
    provider = (profile.provider or "").strip().lower()
    if provider == "deepseek":
        return True

    model_name = (profile.model_name or "").strip().lower()
    if model_name.startswith("deepseek"):
        return True

    base_url = resolve_base_url(profile.api_base_url).lower()
    return "deepseek" in base_url


def build_endpoint_url(base_url: str, suffix: str) -> str:
    return f"{base_url.rstrip('/')}/{suffix.lstrip('/')}"


def compute_duration_ms(start: float) -> int:
    return max(int((perf_counter() - start) * 1000), 1)


def build_responses_payload(payload: dict[str, object]) -> dict[str, object]:
    request_payload: dict[str, object] = {
        "model": payload["model"],
        "input": payload.get("messages", []),
    }
    if payload.get("temperature") is not None:
        request_payload["temperature"] = payload["temperature"]
    if payload.get("max_tokens") is not None:
        request_payload["max_output_tokens"] = payload["max_tokens"]
    if payload.get("prompt_cache_key") is not None:
        request_payload["prompt_cache_key"] = payload["prompt_cache_key"]
    if payload.get("prompt_cache_retention") is not None:
        request_payload["prompt_cache_retention"] = payload["prompt_cache_retention"]
    return request_payload


def extract_chat_completion_content(data: dict[str, object]) -> str:
    content = data["choices"][0]["message"]["content"]
    if not isinstance(content, str):
        raise ValueError("choices[0].message.content 不是字符串")
    return content


def extract_responses_content(data: dict[str, object]) -> str:
    direct_output_text = data.get("output_text")
    if isinstance(direct_output_text, str) and direct_output_text.strip():
        return direct_output_text

    output_items = data.get("output")
    if not isinstance(output_items, list):
        raise ValueError("responses.output 不存在")

    chunks: list[str] = []
    for output_item in output_items:
        if not isinstance(output_item, dict):
            continue
        content_items = output_item.get("content")
        if not isinstance(content_items, list):
            continue
        for content_item in content_items:
            if not isinstance(content_item, dict):
                continue
            text_value = content_item.get("text")
            if isinstance(text_value, str) and text_value.strip():
                chunks.append(text_value)

    if not chunks:
        raise ValueError("responses.output 缺少文本内容")
    return "\n".join(chunks).strip()


def extract_model_ids(data: dict[str, object]) -> list[str]:
    raw_items = data.get("data", data.get("models"))
    if not isinstance(raw_items, list):
        raise ValueError("缺少 data/models 列表")

    model_ids: list[str] = []
    for item in raw_items:
        if isinstance(item, str) and item.strip():
            model_ids.append(item.strip())
            continue
        if not isinstance(item, dict):
            continue
        model_id = item.get("id")
        if isinstance(model_id, str) and model_id.strip():
            model_ids.append(model_id.strip())

    if not model_ids:
        raise ValueError("未解析到模型 ID")
    return model_ids


def format_http_error(status_code: int, response_text: str, request_url: str) -> str:
    return f"模型接口返回错误 {status_code}: {response_text[:300]} (请求 URL: {request_url})"


def parse_completion_usage(raw_usage: object) -> ChatCompletionUsage | None:
    if not isinstance(raw_usage, dict):
        return None
    cached_tokens = None
    for details_key in ("prompt_tokens_details", "input_tokens_details"):
        details = raw_usage.get(details_key)
        if isinstance(details, dict):
            cached_tokens = _coerce_token_count(details.get("cached_tokens"))
            if cached_tokens is not None:
                break
    return ChatCompletionUsage(
        prompt_tokens=_coerce_token_count(
            raw_usage.get("prompt_tokens", raw_usage.get("input_tokens")),
        ),
        completion_tokens=_coerce_token_count(
            raw_usage.get("completion_tokens", raw_usage.get("output_tokens")),
        ),
        total_tokens=_coerce_token_count(raw_usage.get("total_tokens")),
        cached_tokens=cached_tokens,
    )


def _normalize_match_and_draft_result(result: MatchAndDraftResult) -> MatchAndDraftResult:
    normalized_match = _normalize_match_evaluation_result(
        MatchEvaluationResult(
            match_score=result.match_score,
            match_reason=result.match_reason,
            fit_points=result.fit_points,
            risk_points=result.risk_points,
            keywords=result.keywords,
        ),
    )
    normalized_draft = _normalize_draft_generation_result(
        DraftGenerationResult(
            subject=result.subject,
            body_text=result.body_text,
            body_html=result.body_html,
            rich_body=result.rich_body,
            suggested_material_ids=result.suggested_material_ids,
        ),
    )
    result.match_score = normalized_match.match_score
    result.match_reason = normalized_match.match_reason
    result.fit_points = normalized_match.fit_points
    result.risk_points = normalized_match.risk_points
    result.keywords = normalized_match.keywords
    result.subject = normalized_draft.subject
    result.body_text = normalized_draft.body_text
    result.body_html = normalized_draft.body_html
    result.rich_body = normalized_draft.rich_body
    result.suggested_material_ids = normalized_draft.suggested_material_ids
    return result


def _normalize_match_evaluation_result(result: MatchEvaluationResult) -> MatchEvaluationResult:
    result.match_reason = _normalize_text_field(result.match_reason, "match_reason")
    result.fit_points = _normalize_string_list(result.fit_points, 5)
    result.risk_points = _normalize_string_list(result.risk_points, 5)
    result.keywords = _normalize_string_list(result.keywords, 6)
    return result


def _normalize_draft_generation_result(result: DraftGenerationResult) -> DraftGenerationResult:
    result.subject = _normalize_text_field(result.subject, "subject")
    if result.rich_body is not None:
        rendered = render_rich_text_document(result.rich_body)
    elif result.body_html:
        rendered = normalize_email_html(result.body_html)
    elif result.body_text:
        rendered = text_to_email_html(result.body_text)
    else:
        raise LLMRuntimeError("模型返回的富文本正文为空")
    result.body_text = rendered.text
    result.body_html = rendered.html
    result.suggested_material_ids = _normalize_integer_list(result.suggested_material_ids)
    return result


def _normalize_text_field(value: str, field_name: str) -> str:
    cleaned = " ".join(value.split()) if field_name == "subject" else value.strip()
    if not cleaned:
        raise LLMRuntimeError(f"模型返回的 {field_name} 为空")
    return cleaned


def _normalize_html_field(value: str, fallback_text: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        return text_to_html(fallback_text)
    if "<" not in cleaned or ">" not in cleaned:
        return text_to_html(cleaned)

    soup = BeautifulSoup(cleaned, "html.parser")
    if not soup.get_text(" ", strip=True):
        raise LLMRuntimeError("模型返回的 body_html 缺少可见正文")
    return str(soup)


def _normalize_string_list(values: list[str], max_items: int) -> list[str]:
    normalized: list[str] = []
    for value in values:
        cleaned = str(value).strip().strip("-•")
        cleaned = re.sub(r"\s+", " ", cleaned)
        if not cleaned or cleaned in normalized:
            continue
        normalized.append(cleaned)
        if len(normalized) >= max_items:
            break
    return normalized


def _normalize_integer_list(values: list[int]) -> list[int]:
    normalized: list[int] = []
    for value in values:
        try:
            parsed = int(value)
        except (TypeError, ValueError):
            continue
        if parsed in normalized:
            continue
        normalized.append(parsed)
    return normalized


def estimate_text_tokens(text: str) -> int:
    if not text.strip():
        return 0
    cjk_count = len(re.findall(r"[\u4e00-\u9fff]", text))
    ascii_count = len(re.findall(r"[A-Za-z0-9_]", text))
    other_count = max(len(text) - cjk_count - ascii_count, 0)
    return max(cjk_count + ceil(ascii_count / 4) + ceil(other_count / 3), 1)


def _coerce_token_count(value: object) -> int | None:
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    return None
