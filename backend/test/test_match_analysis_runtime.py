from __future__ import annotations

import asyncio
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.models import (
    Base,
    EmailTask,
    IdentityMaterial,
    IdentityProfile,
    LLMProfile,
    MatchAnalysisRun,
    Professor,
)
from app.services import llm_runtime
from app.services.task_runtime import calculate_task_match_once


class MatchAnalysisRuntimeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "match_analysis_test.db"
        self.engine = create_async_engine(
            f"sqlite+aiosqlite:///{self.db_path.as_posix()}",
            future=True,
        )
        self.session_factory = async_sessionmaker(
            bind=self.engine,
            autoflush=False,
            expire_on_commit=False,
        )
        self._run_async(self._create_schema())
        self.email_task_id = self._run_async(self._create_email_task())

    def tearDown(self) -> None:
        self._run_async(self.engine.dispose())
        self.temp_dir.cleanup()

    def _run_async(self, awaitable):
        return asyncio.run(awaitable)

    async def _create_schema(self) -> None:
        async with self.engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)

    async def _create_email_task(self) -> int:
        async with self.session_factory() as session:
            identity = IdentityProfile(
                name="测试身份",
                profile_name="测试身份",
                sender_name="测试身份",
                email_address="sender@example.com",
                smtp_host="smtp.example.com",
                smtp_port=465,
                smtp_username="sender@example.com",
                smtp_password="secret",
                default_language="zh-CN",
                outreach_generation_mode="llm",
            )
            profile = LLMProfile(
                name="测试模型",
                provider="openai",
                api_key="test-key",
                model_name="gpt-test",
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
            session.add_all([identity, profile, professor])
            await session.flush()

            material = IdentityMaterial(
                identity_id=identity.id,
                display_name="简历",
                file_path="data/materials/resume.txt",
                original_filename="resume.txt",
                material_type="resume",
                sha256="a" * 64,
                extracted_text="我做过信息抽取与智能体相关研究。",
            )
            session.add(material)
            await session.flush()
            identity.current_primary_material_id = material.id

            task = EmailTask(
                identity_id=identity.id,
                llm_profile_id=profile.id,
                professor_id=professor.id,
                primary_material_id=material.id,
                selected_material_ids=[],
            )
            session.add(task)
            await session.commit()
            return task.id

    def test_calculate_match_persists_successful_token_audit(self) -> None:
        generation = llm_runtime.GeneratedMatchEvaluation(
            result=llm_runtime.MatchEvaluationResult(
                match_score=91,
                match_reason="研究方向接近",
                fit_points=["信息抽取"],
                risk_points=[],
                keywords=["信息抽取"],
            ),
            usage=llm_runtime.ChatCompletionUsage(
                prompt_tokens=100,
                completion_tokens=20,
                total_tokens=120,
                cached_tokens=64,
            ),
            endpoint_kind="chat_completions",
            status_code=200,
            duration_ms=321,
            prompt_hash="a" * 64,
            stable_prefix_hash="b" * 64,
        )

        with patch(
            "app.services.task_runtime.llm_runtime.generate_match_evaluation",
            new=AsyncMock(return_value=generation),
        ):
            result = self._run_async(
                calculate_task_match_once(
                    self.session_factory,
                    self.email_task_id,
                ),
            )

        self.assertEqual(result.usage.total_tokens, 120)
        self.assertIsNotNone(result.run_id)

        runs = self._run_async(self._list_runs())
        self.assertEqual(len(runs), 1)
        self.assertTrue(runs[0].success)
        self.assertEqual(runs[0].match_score, 91)
        self.assertEqual(runs[0].cached_tokens, 64)

    def test_calculate_match_persists_failed_token_audit(self) -> None:
        with patch(
            "app.services.task_runtime.llm_runtime.generate_match_evaluation",
            new=AsyncMock(
                side_effect=llm_runtime.LLMRuntimeError(
                    "模型请求失败",
                    endpoint_kind="chat_completions",
                    status_code=500,
                    duration_ms=222,
                ),
            ),
        ):
            result = self._run_async(
                calculate_task_match_once(
                    self.session_factory,
                    self.email_task_id,
                ),
            )

        self.assertIsNone(result.usage.total_tokens)
        self.assertIsNotNone(result.run_id)

        runs = self._run_async(self._list_runs())
        self.assertEqual(len(runs), 1)
        self.assertFalse(runs[0].success)
        self.assertEqual(runs[0].status_code, 500)
        self.assertIn("模型请求失败", runs[0].error_message)

    async def _list_runs(self) -> list[MatchAnalysisRun]:
        async with self.session_factory() as session:
            return list(await session.scalars(select(MatchAnalysisRun)))


if __name__ == "__main__":
    unittest.main()
