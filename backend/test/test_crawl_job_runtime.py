from __future__ import annotations

import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.models import Base, CrawlCandidate, CrawlJob, CrawlJobStatus, LLMProfile
from app.services.crawl_job_runtime import run_queued_crawl_jobs_once
from app.services.crawler_tools import (
    CrawlToolContext,
    ProfessorCandidatePayload,
    save_candidates,
)


class CrawlJobRuntimeTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        db_path = Path(self.temp_dir.name) / "crawl_job_runtime.db"
        self.debug_dir = Path(self.temp_dir.name) / "crawler-debug"
        self.engine = create_async_engine(f"sqlite+aiosqlite:///{db_path.as_posix()}")
        self.session_factory = async_sessionmaker(
            bind=self.engine,
            autoflush=False,
            expire_on_commit=False,
        )
        async with self.engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)

    async def asyncTearDown(self) -> None:
        await self.engine.dispose()
        os.environ.pop("CRAWLER_DEBUG", None)
        os.environ.pop("CRAWLER_DEBUG_DIR", None)
        from app.core.config import get_settings

        get_settings.cache_clear()
        self.temp_dir.cleanup()

    async def test_run_queued_crawl_job_moves_to_needs_review_when_candidates_saved(self) -> None:
        job_id = await self._create_default_profile_and_job()

        async def fake_run(
            ctx: CrawlToolContext,
            llm_profile: LLMProfile,
            trace_callback=None,
        ) -> dict[str, object]:
            _ = llm_profile
            if trace_callback is not None:
                await trace_callback(
                    {
                        "type": "updates",
                        "data": {
                            "model": {
                                "messages": [
                                    "tool_calls=[{'name': 'save_professor_candidates'}]",
                                ]
                            }
                        },
                    }
                )
            await save_candidates(
                ctx,
                [
                    ProfessorCandidatePayload(
                        name="张三",
                        email="zhang@example.edu",
                        title="教授",
                    )
                ],
            )
            return {}

        with patch(
            "app.services.crawl_job_runtime.run_faculty_crawler_agent",
            new=fake_run,
        ):
            processed = await run_queued_crawl_jobs_once(self.session_factory)

        self.assertEqual(processed, 1)
        job = await self._get_job(job_id)
        self.assertEqual(job.status, CrawlJobStatus.NEEDS_REVIEW.value)
        self.assertIsNone(job.error_message)
        self.assertEqual(await self._count_candidates(job_id), 1)

    async def test_run_queued_crawl_job_fails_when_agent_finishes_without_saved_candidates(self) -> None:
        job_id = await self._create_default_profile_and_job()

        async def fake_run(
            ctx: CrawlToolContext,
            llm_profile: LLMProfile,
            trace_callback=None,
        ) -> dict[str, object]:
            _ = ctx, llm_profile
            if trace_callback is not None:
                await trace_callback(
                    {
                        "type": "updates",
                        "data": {
                            "model": {
                                "messages": [
                                    "invalid_tool_calls=[{'name': 'save_professor_candidates'}] finish_reason='length'",
                                ]
                            }
                        },
                    }
                )
            return {}

        with patch(
            "app.services.crawl_job_runtime.run_faculty_crawler_agent",
            new=fake_run,
        ):
            processed = await run_queued_crawl_jobs_once(self.session_factory)

        self.assertEqual(processed, 1)
        job = await self._get_job(job_id)
        self.assertEqual(job.status, CrawlJobStatus.FAILED.value)
        self.assertIsNotNone(job.error_message)
        self.assertIn("save_professor_candidates", job.error_message)
        self.assertEqual(await self._count_candidates(job_id), 0)

    async def test_run_queued_crawl_job_writes_full_debug_trace_when_enabled(self) -> None:
        os.environ["CRAWLER_DEBUG"] = "1"
        os.environ["CRAWLER_DEBUG_DIR"] = self.debug_dir.as_posix()
        from app.core.config import get_settings

        get_settings.cache_clear()
        job_id = await self._create_default_profile_and_job()
        oversized_payload = "x" * 25000

        async def fake_run(
            ctx: CrawlToolContext,
            llm_profile: LLMProfile,
            trace_callback=None,
        ) -> dict[str, object]:
            _ = ctx, llm_profile
            if trace_callback is not None:
                await trace_callback(
                    {
                        "type": "updates",
                        "data": {
                            "model": {
                                "messages": [
                                    {
                                        "role": "assistant",
                                        "content": oversized_payload,
                                    }
                                ],
                                "finish_reason": "tool_calls",
                            }
                        },
                    }
                )
            return {}

        with patch(
            "app.services.crawl_job_runtime.run_faculty_crawler_agent",
            new=fake_run,
        ):
            await run_queued_crawl_jobs_once(self.session_factory)

        debug_file = self.debug_dir / f"crawl-job-{job_id}.jsonl"
        self.assertTrue(debug_file.exists())
        records = [
            json.loads(line)
            for line in debug_file.read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
        self.assertGreaterEqual(len(records), 1)
        self.assertEqual(records[0]["job_id"], job_id)
        serialized_raw_event = json.dumps(records[0]["raw_event"], ensure_ascii=False)
        self.assertIn(oversized_payload, serialized_raw_event)

    async def _create_default_profile_and_job(self) -> int:
        async with self.session_factory() as session:
            profile = LLMProfile(
                name="default",
                provider="openai",
                api_key="test-key",
                model_name="test-model",
                is_default=True,
            )
            job = CrawlJob(
                university="示例大学",
                school="计算机学院",
                start_url="https://example.edu/faculty",
                status=CrawlJobStatus.QUEUED.value,
                progress_current=0,
                progress_total=0,
            )
            session.add(profile)
            session.add(job)
            await session.commit()
            await session.refresh(job)
            return job.id

    async def _get_job(self, job_id: int) -> CrawlJob:
        async with self.session_factory() as session:
            job = await session.get(CrawlJob, job_id)
            if job is None:
                raise AssertionError(f"crawl job {job_id} not found")
            return job

    async def _count_candidates(self, job_id: int) -> int:
        async with self.session_factory() as session:
            rows = await session.scalars(
                select(CrawlCandidate).where(CrawlCandidate.job_id == job_id)
            )
            return len(list(rows))


if __name__ == "__main__":
    unittest.main()
