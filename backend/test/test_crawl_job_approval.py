from __future__ import annotations

import asyncio
import os
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient


class CrawlJobApprovalTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.temp_dir = tempfile.TemporaryDirectory()
        cls.db_path = Path(cls.temp_dir.name) / "crawl_job_approval.db"
        os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{cls.db_path.as_posix()}"
        os.environ["ENABLE_BACKGROUND_WORKERS"] = "0"

        from app.core.config import get_settings
        from app.core.database import dispose_engine, get_engine, get_session_factory
        from main import create_app

        get_settings.cache_clear()
        if get_engine.cache_info().currsize:
            asyncio.run(dispose_engine())
        get_session_factory.cache_clear()
        get_settings.cache_clear()

        asyncio.run(cls._create_schema())
        cls.client = TestClient(create_app())

    @classmethod
    def tearDownClass(cls) -> None:
        cls.client.close()

        from app.core.config import get_settings
        from app.core.database import dispose_engine, get_engine, get_session_factory

        if get_engine.cache_info().currsize:
            asyncio.run(dispose_engine())
        get_session_factory.cache_clear()
        get_settings.cache_clear()
        os.environ.pop("DATABASE_URL", None)
        os.environ.pop("ENABLE_BACKGROUND_WORKERS", None)
        cls.temp_dir.cleanup()

    def setUp(self) -> None:
        asyncio.run(self._clear_database())

    def test_approve_rejects_candidates_without_valid_email(self) -> None:
        job_id, candidate_id = asyncio.run(self._create_crawl_candidate(email=None))

        response = self.client.post(
            f"/api/crawl-jobs/{job_id}/approve",
            json={"candidate_ids": [candidate_id]},
        )

        self.assertEqual(response.status_code, 400, msg=response.text)
        self.assertEqual(response.json()["detail"], "候选导师缺少有效邮箱，无法导入")
        candidate, professor_count = asyncio.run(self._load_candidate_and_professor_count(candidate_id))
        self.assertEqual(candidate.review_status, "pending")
        self.assertIsNone(candidate.professor_id)
        self.assertEqual(professor_count, 0)

    async def _create_crawl_candidate(self, email: str | None) -> tuple[int, int]:
        from app.core.database import get_session_factory
        from app.models import CrawlCandidate, CrawlJob, CrawlJobStatus

        async with get_session_factory()() as session:
            job = CrawlJob(
                university="示例大学",
                school="计算机学院",
                start_url="https://example.edu/faculty",
                start_urls=["https://example.edu/faculty"],
                status=CrawlJobStatus.NEEDS_REVIEW.value,
                progress_current=1,
                progress_total=1,
            )
            session.add(job)
            await session.flush()
            candidate = CrawlCandidate(
                job_id=job.id,
                name="无邮箱导师",
                email=email,
                title="Professor",
                university="示例大学",
                school="计算机学院",
                department="计算机科学系",
                research_direction="智能系统",
                recent_papers=[],
                confidence=0.9,
            )
            session.add(candidate)
            await session.commit()
            return job.id, candidate.id

    async def _load_candidate_and_professor_count(self, candidate_id: int):
        from sqlalchemy import func, select

        from app.core.database import get_session_factory
        from app.models import CrawlCandidate, Professor

        async with get_session_factory()() as session:
            candidate = await session.get(CrawlCandidate, candidate_id)
            professor_count = await session.scalar(select(func.count()).select_from(Professor))
            return candidate, int(professor_count or 0)

    async def _clear_database(self) -> None:
        from sqlalchemy import delete

        from app.core.database import get_session_factory
        from app.models import CrawlCandidate, CrawlJob, OperationLog, Professor

        async with get_session_factory()() as session:
            for model in [OperationLog, CrawlCandidate, CrawlJob, Professor]:
                await session.execute(delete(model))
            await session.commit()

    @classmethod
    async def _create_schema(cls) -> None:
        from app.core.database import get_engine
        from app.models import Base

        async with get_engine().begin() as connection:
            await connection.run_sync(Base.metadata.create_all)


if __name__ == "__main__":
    unittest.main()
