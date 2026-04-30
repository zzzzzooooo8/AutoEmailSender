from __future__ import annotations

import asyncio
import tempfile
import unittest
from datetime import UTC, datetime, timedelta
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.models import (
    Base,
    CrawlJob,
    CrawlJobRun,
    CrawlJobStatus,
    EmailDirection,
    EmailLog,
    EmailTask,
    IdentityProfile,
    LLMProfile,
    MatchAnalysisRun,
    Professor,
)
from app.services.token_usage_records import list_token_usage_records


class TokenUsageRecordsServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "token_usage_records_test.db"
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

    def tearDown(self) -> None:
        self._run_async(self.engine.dispose())
        self.temp_dir.cleanup()

    def _run_async(self, awaitable):
        return asyncio.run(awaitable)

    async def _create_schema(self) -> None:
        async with self.engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)

    async def _seed_records(self) -> None:
        now = datetime(2026, 4, 29, 10, 0, 0, tzinfo=UTC)
        async with self.session_factory() as session:
            identity = IdentityProfile(
                name="博士申请邮箱",
                profile_name="博士申请邮箱",
                sender_name="王同学",
                email_address="sender@example.com",
                smtp_host="smtp.example.com",
                smtp_port=465,
                smtp_username="sender@example.com",
                smtp_password="secret",
                default_language="zh-CN",
                outreach_generation_mode="llm",
            )
            llm_profile = LLMProfile(
                name="OpenAI",
                provider="openai",
                api_key="test-key",
                model_name="gpt-test",
            )
            professor = Professor(
                name="李老师",
                email="li@example.edu",
                university="示例大学",
                school="计算机学院",
                research_direction="信息抽取",
            )
            session.add_all([identity, llm_profile, professor])
            await session.flush()

            task = EmailTask(
                identity_id=identity.id,
                llm_profile_id=llm_profile.id,
                professor_id=professor.id,
                selected_material_ids=[],
            )
            session.add(task)
            await session.flush()

            crawl_job = CrawlJob(
                university="示例大学",
                school="计算机学院",
                start_url="https://example.edu/faculty",
                status=CrawlJobStatus.RUNNING.value,
                progress_current=1,
                progress_total=3,
                llm_profile_id=llm_profile.id,
                created_at=now - timedelta(minutes=4),
                updated_at=now - timedelta(minutes=4),
            )
            session.add(crawl_job)
            await session.flush()
            session.add(
                CrawlJobRun(
                    job_id=crawl_job.id,
                    attempt_number=1,
                    status=CrawlJobStatus.RUNNING.value,
                    input_tokens=100,
                    output_tokens=20,
                    total_tokens=120,
                    created_at=now - timedelta(minutes=4),
                    updated_at=now - timedelta(minutes=1),
                ),
            )

            session.add(
                MatchAnalysisRun(
                    email_task_id=task.id,
                    professor_id=professor.id,
                    identity_id=identity.id,
                    llm_profile_id=llm_profile.id,
                    success=True,
                    match_score=91,
                    prompt_tokens=200,
                    completion_tokens=30,
                    cached_tokens=80,
                    total_tokens=230,
                    created_at=now - timedelta(minutes=2),
                ),
            )

            session.add(
                EmailLog(
                    email_task_id=task.id,
                    identity_id=identity.id,
                    llm_profile_id=llm_profile.id,
                    professor_id=professor.id,
                    direction=EmailDirection.DRAFT.value,
                    subject="申请交流",
                    content="李老师您好",
                    provider_payload={
                        "source": "llm",
                        "usage": {
                            "prompt_tokens": 300,
                            "completion_tokens": 40,
                            "total_tokens": 340,
                        },
                    },
                    created_at=now - timedelta(minutes=3),
                ),
            )

            session.add(
                EmailLog(
                    email_task_id=task.id,
                    identity_id=identity.id,
                    llm_profile_id=llm_profile.id,
                    professor_id=professor.id,
                    direction=EmailDirection.DRAFT.value,
                    subject="模板草稿",
                    content="模板正文",
                    provider_payload={"source": "template", "usage": None},
                    created_at=now,
                ),
            )

            await session.commit()

    async def _seed_history_records(self) -> None:
        base = datetime(2026, 4, 30, 10, 0, 0, tzinfo=UTC)
        async with self.session_factory() as session:
            identity = IdentityProfile(
                name="博士申请邮箱",
                profile_name="博士申请邮箱",
                sender_name="王同学",
                email_address="sender@example.com",
                smtp_host="smtp.example.com",
                smtp_port=465,
                smtp_username="sender@example.com",
                smtp_password="secret",
                default_language="zh-CN",
                outreach_generation_mode="llm",
            )
            llm_profile = LLMProfile(
                name="OpenAI",
                provider="openai",
                api_key="test-key",
                model_name="gpt-test",
            )
            professor = Professor(
                name="李老师",
                email="li@example.edu",
                university="示例大学",
                school="计算机学院",
                research_direction="信息抽取",
            )
            session.add_all([identity, llm_profile, professor])
            await session.flush()

            task = EmailTask(
                identity_id=identity.id,
                llm_profile_id=llm_profile.id,
                professor_id=professor.id,
                selected_material_ids=[],
            )
            session.add(task)
            await session.flush()

            for index in range(7):
                created_at = base - timedelta(hours=index)
                session.add(
                    MatchAnalysisRun(
                        email_task_id=task.id,
                        professor_id=professor.id,
                        identity_id=identity.id,
                        llm_profile_id=llm_profile.id,
                        success=True,
                        match_score=80 + index,
                        prompt_tokens=100 + index,
                        completion_tokens=10 + index,
                        cached_tokens=5 * index,
                        total_tokens=110 + index * 2,
                        created_at=created_at,
                    )
                )

            crawl_job = CrawlJob(
                university="示例大学",
                school="计算机学院",
                start_url="https://example.edu/faculty",
                status=CrawlJobStatus.COMPLETED.value,
                progress_current=3,
                progress_total=3,
                llm_profile_id=llm_profile.id,
                created_at=base - timedelta(hours=8),
                updated_at=base - timedelta(hours=8),
            )
            session.add(crawl_job)
            await session.flush()
            session.add(
                CrawlJobRun(
                    job_id=crawl_job.id,
                    attempt_number=1,
                    status=CrawlJobStatus.COMPLETED.value,
                    input_tokens=800,
                    output_tokens=120,
                    total_tokens=920,
                    created_at=base - timedelta(hours=8),
                    updated_at=base - timedelta(hours=8),
                )
            )

            session.add(
                EmailLog(
                    email_task_id=task.id,
                    identity_id=identity.id,
                    llm_profile_id=llm_profile.id,
                    professor_id=professor.id,
                    direction=EmailDirection.DRAFT.value,
                    subject="申请交流",
                    content="李老师您好",
                    provider_payload={
                        "source": "llm",
                        "usage": {
                            "prompt_tokens": 500,
                            "completion_tokens": 60,
                            "total_tokens": 560,
                        },
                    },
                    created_at=base - timedelta(hours=9),
                )
            )

            await session.commit()

    def test_lists_recent_function_level_token_records(self) -> None:
        self._run_async(self._seed_records())

        async def run_query():
            async with self.session_factory() as session:
                return await list_token_usage_records(session, page=1, page_size=20)

        result = self._run_async(run_query())

        self.assertEqual(
            [item.feature_type for item in result.records],
            [
                "match_analysis",
                "draft_generation",
                "crawl",
            ],
        )
        self.assertEqual(result.records[0].input_tokens, 200)
        self.assertEqual(result.records[0].output_tokens, 30)
        self.assertEqual(result.records[0].cached_tokens, 80)
        self.assertEqual(result.records[0].status, "success")
        self.assertEqual(result.records[1].total_tokens, 340)
        self.assertEqual(result.records[2].status, "running")
        self.assertEqual(result.summary.record_count, 3)
        self.assertEqual(result.summary.input_tokens, 600)
        self.assertEqual(result.summary.output_tokens, 90)
        self.assertEqual(result.summary.cached_tokens, 80)
        self.assertEqual(result.summary.total_tokens, 690)

    def test_api_returns_token_usage_records(self) -> None:
        self._run_async(self._seed_records())

        from app.core.database import get_async_session
        from main import create_app

        async def override_session():
            async with self.session_factory() as session:
                yield session

        app = create_app()
        app.dependency_overrides[get_async_session] = override_session
        client = TestClient(app)
        try:
            response = client.get("/api/token-usage/records?page=1&page_size=2")
        finally:
            client.close()

        self.assertEqual(response.status_code, 200, msg=response.text)
        payload = response.json()
        self.assertEqual(len(payload["records"]), 2)
        self.assertEqual(payload["records"][0]["feature_type"], "match_analysis")
        self.assertEqual(payload["summary"]["record_count"], 3)
        self.assertEqual(payload["pagination"]["total_records"], 3)

    def test_lists_records_with_pagination(self) -> None:
        self._run_async(self._seed_history_records())

        async def run_query():
            async with self.session_factory() as session:
                return await list_token_usage_records(session, page=2, page_size=5)

        result = self._run_async(run_query())

        self.assertEqual(result.pagination.page, 2)
        self.assertEqual(result.pagination.page_size, 5)
        self.assertEqual(result.pagination.total_records, 9)
        self.assertEqual(result.pagination.total_pages, 2)
        self.assertEqual(len(result.records), 4)
        self.assertEqual(result.records[0].feature_type, "match_analysis")
        self.assertEqual(result.summary.record_count, 9)

    def test_filters_records_by_feature_and_time_range(self) -> None:
        self._run_async(self._seed_history_records())
        start_at = datetime(2026, 4, 30, 6, 0, 0, tzinfo=UTC)
        end_at = datetime(2026, 4, 30, 8, 0, 0, tzinfo=UTC)

        async def run_query():
            async with self.session_factory() as session:
                return await list_token_usage_records(
                    session,
                    page=1,
                    page_size=5,
                    feature_type="match_analysis",
                    start_at=start_at,
                    end_at=end_at,
                )

        result = self._run_async(run_query())

        self.assertEqual(result.pagination.total_records, 3)
        self.assertEqual(
            [item.feature_type for item in result.records],
            ["match_analysis"] * 3,
        )
        self.assertEqual(
            [item.created_at.hour for item in result.records],
            [8, 7, 6],
        )

    def test_api_returns_paginated_filtered_records(self) -> None:
        self._run_async(self._seed_history_records())

        from app.core.database import get_async_session
        from main import create_app

        async def override_session():
            async with self.session_factory() as session:
                yield session

        app = create_app()
        app.dependency_overrides[get_async_session] = override_session
        client = TestClient(app)
        try:
            response = client.get(
                "/api/token-usage/records",
                params={
                    "page": 2,
                    "page_size": 5,
                    "feature_type": "match_analysis",
                },
            )
        finally:
            client.close()

        self.assertEqual(response.status_code, 200, msg=response.text)
        payload = response.json()
        self.assertEqual(payload["pagination"]["page"], 2)
        self.assertEqual(payload["pagination"]["page_size"], 5)
        self.assertEqual(payload["pagination"]["total_records"], 7)
        self.assertEqual(len(payload["records"]), 2)


if __name__ == "__main__":
    unittest.main()
