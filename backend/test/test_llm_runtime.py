from __future__ import annotations

import unittest
from unittest.mock import patch

from app.models import LLMProfile
from app.services.llm_runtime import (
    build_draft_prompt,
    fetch_llm_profile_models,
    LLMRuntimeError,
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
