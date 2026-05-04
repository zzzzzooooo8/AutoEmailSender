from __future__ import annotations

import unittest
from unittest.mock import patch

from app.models import LLMProfile
from app.services.llm_runtime import (
    build_match_prompt_parts,
    build_draft_prompt,
    fetch_llm_profile_models,
    generate_match_evaluation,
    LLMRuntimeError,
    parse_completion_usage,
    request_chat_completion,
    resolve_base_url,
)


class _FakeResponse:
    def __init__(self, status_code: int, payload: dict[str, object] | None = None, text: str = "") -> None:
        self.status_code = status_code
        self._payload = payload or {}
        self.text = text

    def json(self) -> dict[str, object]:
        return self._payload


class _FakeAsyncClient:
    def __init__(self, responses: list[_FakeResponse], calls: list[tuple[str, dict[str, object] | None]]) -> None:
        self._responses = responses
        self._calls = calls

    async def __aenter__(self) -> "_FakeAsyncClient":
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        return None

    async def post(
        self,
        url: str,
        *,
        headers: dict[str, str] | None = None,
        json: dict[str, object] | None = None,
    ) -> _FakeResponse:
        self._calls.append((url, json))
        return self._responses.pop(0)

    async def get(
        self,
        url: str,
        *,
        headers: dict[str, str] | None = None,
    ) -> _FakeResponse:
        self._calls.append((url, None))
        return self._responses.pop(0)


class LLMRuntimeTests(unittest.IsolatedAsyncioTestCase):
    def test_parse_completion_usage_reads_cached_tokens_from_chat_shape(self) -> None:
        usage = parse_completion_usage(
            {
                "prompt_tokens": 1200,
                "completion_tokens": 80,
                "total_tokens": 1280,
                "prompt_tokens_details": {"cached_tokens": 1024},
            },
        )

        self.assertIsNotNone(usage)
        self.assertEqual(usage.prompt_tokens, 1200)
        self.assertEqual(usage.completion_tokens, 80)
        self.assertEqual(usage.total_tokens, 1280)
        self.assertEqual(usage.cached_tokens, 1024)

    def test_build_match_prompt_parts_places_stable_identity_before_professor(self) -> None:
        from app.models import IdentityMaterial, IdentityProfile, Professor

        identity = IdentityProfile(
            id=3,
            name="张三",
            email_address="sender@example.com",
            smtp_host="smtp.example.com",
            smtp_port=465,
            smtp_username="sender@example.com",
            smtp_password="secret",
            default_language="zh-CN",
            outreach_generation_mode="llm",
        )
        primary_material = IdentityMaterial(
            id=7,
            identity_id=3,
            display_name="简历",
            file_path="data/materials/resume.txt",
            original_filename="resume.txt",
            material_type="resume",
            extracted_text="我做过信息抽取与智能体相关研究。",
        )
        professor = Professor(
            name="李老师",
            email="prof@example.edu",
            title="Professor",
            university="Example University",
            school="Computer Science",
            research_direction="Information Extraction",
            recent_papers=["Paper A"],
        )

        parts = build_match_prompt_parts(
            identity=identity,
            primary_material=primary_material,
            professor=professor,
            available_materials=[primary_material],
        )

        self.assertLess(parts.prompt.index("默认材料"), parts.prompt.index("导师信息"))
        self.assertIn("信息抽取与智能体", parts.stable_prefix)
        self.assertNotIn("李老师", parts.stable_prefix)
        self.assertEqual(len(parts.prompt_hash), 64)
        self.assertEqual(len(parts.stable_prefix_hash), 64)

    async def test_generate_match_evaluation_uses_temperature_zero_and_prompt_cache_key(self) -> None:
        from app.models import IdentityMaterial, IdentityProfile, Professor

        identity = IdentityProfile(
            id=3,
            name="张三",
            email_address="sender@example.com",
            smtp_host="smtp.example.com",
            smtp_port=465,
            smtp_username="sender@example.com",
            smtp_password="secret",
            current_primary_material_id=7,
            default_language="zh-CN",
            outreach_generation_mode="llm",
        )
        primary_material = IdentityMaterial(
            id=7,
            identity_id=3,
            display_name="简历",
            file_path="data/materials/resume.txt",
            original_filename="resume.txt",
            material_type="resume",
            extracted_text="我做过信息抽取与智能体相关研究。",
        )
        profile = LLMProfile(
            id=5,
            name="openai",
            provider="openai",
            api_base_url=None,
            api_key="test-key",
            model_name="gpt-test",
            temperature=0.8,
        )
        professor = Professor(
            name="李老师",
            email="prof@example.edu",
            title="Professor",
            university="Example University",
            school="Computer Science",
            research_direction="Information Extraction",
            recent_papers=["Paper A"],
        )
        calls: list[tuple[str, dict[str, object] | None]] = []
        responses = [
            _FakeResponse(
                status_code=200,
                payload={
                    "choices": [
                        {
                            "message": {
                                "content": '{"match_score":88,"match_reason":"方向匹配","fit_points":["信息抽取"],"risk_points":[],"keywords":["信息抽取"]}',
                            },
                        },
                    ],
                    "usage": {
                        "prompt_tokens": 100,
                        "completion_tokens": 20,
                        "total_tokens": 120,
                        "prompt_tokens_details": {"cached_tokens": 64},
                    },
                },
            ),
        ]

        with patch(
            "app.services.llm_runtime.httpx.AsyncClient",
            side_effect=lambda *args, **kwargs: _FakeAsyncClient(responses, calls),
        ):
            result = await generate_match_evaluation(
                identity=identity,
                primary_material=primary_material,
                llm_profile=profile,
                professor=professor,
                available_materials=[primary_material],
            )

        payload = calls[0][1]
        self.assertEqual(payload["temperature"], 0)
        self.assertEqual(payload["prompt_cache_key"], "match:v1:3:7:5")
        self.assertEqual(result.usage.cached_tokens, 64)
        self.assertEqual(len(result.prompt_hash), 64)
        self.assertEqual(len(result.stable_prefix_hash), 64)

    def test_match_only_prompt_includes_explicit_score_rubric(self) -> None:
        from app.services.llm_runtime import SYSTEM_MATCH_ONLY_PROMPT

        expected_fragments = [
            "研究主题匹配度：0-45",
            "能力与方法匹配度：0-25",
            "近期论文交集：0-20",
            "个性化理由充分度：0-10",
            "有近期论文，且论文主题和默认材料有明确交集：应明显高于只有宽泛研究方向的导师",
            "有近期论文，但论文和默认材料交集弱：不因论文数量多而加分",
            "没有近期论文但研究方向具体：match_score 通常最高 80",
            "没有近期论文，但研究方向具体：通常最高 80",
            "没有近期论文，且研究方向很宽泛：match_score 最高 75",
            "没有研究方向，但有近期论文：match_score 最高 85",
            "研究方向和近期论文都缺失：match_score 最高 30",
            "学生默认材料缺少可见研究、项目或技能证据：match_score 最高 60",
            "触发上限规则时，risk_points 必须说明原因",
        ]

        for fragment in expected_fragments:
            with self.subTest(fragment=fragment):
                self.assertIn(fragment, SYSTEM_MATCH_ONLY_PROMPT)

    def test_build_match_prompt_keeps_specific_research_direction_without_recent_papers(self) -> None:
        from app.models import IdentityMaterial, IdentityProfile, Professor

        identity = IdentityProfile(
            id=3,
            name="张三",
            email_address="sender@example.com",
            smtp_host="smtp.example.com",
            smtp_port=465,
            smtp_username="sender@example.com",
            smtp_password="secret",
            default_language="zh-CN",
            outreach_generation_mode="llm",
        )
        primary_material = IdentityMaterial(
            id=7,
            identity_id=3,
            display_name="简历",
            file_path="data/materials/resume.txt",
            original_filename="resume.txt",
            material_type="resume",
            extracted_text="我做过 biomedical information extraction 与大模型项目。",
        )
        professor = Professor(
            name="李老师",
            email="prof@example.edu",
            title="Professor",
            university="Example University",
            school="Computer Science",
            research_direction="LLM-based biomedical information extraction",
            recent_papers=[],
        )

        parts = build_match_prompt_parts(
            identity=identity,
            primary_material=primary_material,
            professor=professor,
            available_materials=[primary_material],
        )

        self.assertIn("LLM-based biomedical information extraction", parts.prompt)
        self.assertIn("近期论文：\n- 无", parts.prompt)

    def test_build_draft_prompt_requires_template_first_and_limits_changes(self) -> None:
        from app.models import IdentityMaterial, IdentityProfile, Professor
        from app.services.llm_runtime import MatchEvaluationResult

        identity = IdentityProfile(
            name="张三",
            email_address="sender@example.com",
            smtp_host="smtp.example.com",
            smtp_port=465,
            smtp_username="sender@example.com",
            smtp_password="secret",
            default_language="zh-CN",
            outreach_generation_mode="llm",
        )
        primary_material = IdentityMaterial(
            id=12,
            identity_id=1,
            display_name="简历",
            file_path="data/materials/resume.txt",
            original_filename="resume.txt",
            material_type="resume",
            extracted_text="我做过信息抽取与智能体相关研究。",
        )
        professor = Professor(
            name="李老师",
            email="prof@example.edu",
            title="Professor",
            university="Example University",
            school="Computer Science",
            department="AI",
            research_direction="Information Extraction",
            recent_papers=["Paper A"],
        )

        prompt = build_draft_prompt(
            identity=identity,
            primary_material=primary_material,
            professor=professor,
            available_materials=[primary_material],
            custom_subject="申请与{{name}}老师交流",
            custom_body="老师您好，我是{{sender_name}}，关注到您在{{research_direction}}方向的工作。",
            current_match=MatchEvaluationResult(
                match_score=91,
                match_reason="研究方向相近",
                fit_points=["信息抽取背景"],
                risk_points=["尚未提到具体合作设想"],
                keywords=["信息抽取"],
            ),
        )

        self.assertIn("套磁信模板主题", prompt)
        self.assertIn("套磁信模板正文", prompt)
        self.assertIn("必须以提供的套磁信模板为基础润色", prompt)
        self.assertIn("只允许改动：称呼、匹配理由、个性化一段、结尾、主题", prompt)
        self.assertIn("不得改写整体结构、段落顺序和主要话术风格", prompt)
        self.assertIn("导师研究方向", prompt)
        self.assertIn("Information Extraction", prompt)
        self.assertIn("围绕导师研究方向", prompt)
        self.assertIn("轻微", prompt)
        self.assertIn("保留可表达的富文本标记", prompt)
        self.assertIn("加粗", prompt)
        self.assertIn("链接", prompt)

    def test_system_draft_prompt_requires_research_direction_and_format_preservation(self) -> None:
        from app.services.llm_runtime import SYSTEM_DRAFT_PROMPT

        self.assertIn("导师研究方向", SYSTEM_DRAFT_PROMPT)
        self.assertIn("轻微", SYSTEM_DRAFT_PROMPT)
        self.assertIn("不要从零重写", SYSTEM_DRAFT_PROMPT)
        self.assertIn("保留", SYSTEM_DRAFT_PROMPT)
        self.assertIn("加粗", SYSTEM_DRAFT_PROMPT)

    def test_resolve_base_url_keeps_user_supplied_api_v3(self) -> None:
        self.assertEqual(
            resolve_base_url("https://ark.cn-beijing.volces.com/api/v3"),
            "https://ark.cn-beijing.volces.com/api/v3",
        )

    async def test_request_chat_completion_falls_back_to_responses(self) -> None:
        profile = LLMProfile(
            name="ark",
            provider="openai",
            api_base_url="https://ark.cn-beijing.volces.com/api/v3",
            api_key="test-key",
            model_name="doubao-seed-2-0-mini-260215",
        )
        calls: list[tuple[str, dict[str, object] | None]] = []
        responses = [
            _FakeResponse(status_code=404, text="not found"),
            _FakeResponse(
                status_code=200,
                payload={
                    "output": [
                        {
                            "content": [
                                {
                                    "type": "output_text",
                                    "text": "READY 火山方舟可用",
                                },
                            ],
                        },
                    ],
                    "usage": {
                        "input_tokens": 12,
                        "output_tokens": 7,
                        "total_tokens": 19,
                    },
                },
            ),
        ]

        with patch(
            "app.services.llm_runtime.httpx.AsyncClient",
            side_effect=lambda *args, **kwargs: _FakeAsyncClient(responses, calls),
        ):
            result = await request_chat_completion(
                profile,
                {
                    "model": profile.model_name,
                    "messages": [{"role": "user", "content": "ping"}],
                    "temperature": 0,
                    "max_tokens": 32,
                },
            )

        self.assertEqual(
            calls[0][0],
            "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
        )
        self.assertEqual(
            calls[1][0],
            "https://ark.cn-beijing.volces.com/api/v3/responses",
        )
        self.assertEqual(result.endpoint_kind, "responses")
        self.assertEqual(result.request_url, "https://ark.cn-beijing.volces.com/api/v3/responses")
        self.assertEqual(
            result.attempted_urls,
            [
                "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
                "https://ark.cn-beijing.volces.com/api/v3/responses",
            ],
        )
        self.assertEqual(result.status_code, 200)
        self.assertIsNotNone(result.duration_ms)
        self.assertEqual(result.usage.prompt_tokens, 12)
        self.assertEqual(result.usage.completion_tokens, 7)
        self.assertEqual(result.usage.total_tokens, 19)

    async def test_fetch_llm_profile_models_uses_models_endpoint(self) -> None:
        profile = LLMProfile(
            name="ark",
            provider="openai",
            api_base_url="https://ark.cn-beijing.volces.com/api/v3",
            api_key="test-key",
            model_name="doubao-seed-2-0-mini-260215",
        )
        calls: list[tuple[str, dict[str, object] | None]] = []
        responses = [
            _FakeResponse(
                status_code=200,
                payload={
                    "data": [
                        {"id": "doubao-seed-2-0-mini-260215"},
                        {"id": "doubao-seed-2-0-pro-250415"},
                    ],
                },
            ),
        ]

        with patch(
            "app.services.llm_runtime.httpx.AsyncClient",
            side_effect=lambda *args, **kwargs: _FakeAsyncClient(responses, calls),
        ):
            result = await fetch_llm_profile_models(profile)

        self.assertEqual(
            calls[0][0],
            "https://ark.cn-beijing.volces.com/api/v3/models",
        )
        self.assertTrue(result.ok)
        self.assertEqual(
            result.models,
            ["doubao-seed-2-0-mini-260215", "doubao-seed-2-0-pro-250415"],
        )
        self.assertTrue(result.selected_model_available)
        self.assertEqual(result.endpoint_kind, "models")
        self.assertEqual(result.status_code, 200)
        self.assertIsNotNone(result.duration_ms)

    async def test_request_chat_completion_reports_attempted_urls_on_404(self) -> None:
        profile = LLMProfile(
            name="ark",
            provider="openai",
            api_base_url="https://ark.cn-beijing.volces.com/api/v3",
            api_key="test-key",
            model_name="doubao-seed-2-0-mini-260215",
        )
        calls: list[tuple[str, dict[str, object] | None]] = []
        responses = [
            _FakeResponse(status_code=404, text="chat route missing"),
            _FakeResponse(status_code=404, text="responses route missing"),
        ]

        with patch(
            "app.services.llm_runtime.httpx.AsyncClient",
            side_effect=lambda *args, **kwargs: _FakeAsyncClient(responses, calls),
        ):
            with self.assertRaises(LLMRuntimeError) as context:
                await request_chat_completion(
                    profile,
                    {
                        "model": profile.model_name,
                        "messages": [{"role": "user", "content": "ping"}],
                        "temperature": 0,
                        "max_tokens": 32,
                    },
                )

        self.assertIn("请求 URL: https://ark.cn-beijing.volces.com/api/v3/responses", str(context.exception))
        self.assertIn("https://ark.cn-beijing.volces.com/api/v3/chat/completions", str(context.exception))
        self.assertEqual(
            context.exception.attempted_urls,
            [
                "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
                "https://ark.cn-beijing.volces.com/api/v3/responses",
            ],
        )


if __name__ == "__main__":
    unittest.main()
