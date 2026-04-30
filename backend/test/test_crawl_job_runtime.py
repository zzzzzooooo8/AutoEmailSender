from __future__ import annotations

import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.models import Base, CrawlCandidate, CrawlJob, CrawlJobRun, CrawlJobStatus, CrawlPage, LLMProfile
from app.services.crawl_job_runtime import _enrich_saved_candidates, run_queued_crawl_jobs_once
from app.services.crawl_job_runs import create_initial_crawl_job_run
from app.services.crawler_tools import (
    CandidateEnrichmentPayload,
    CrawlJobSaveBudgetExceeded,
    CrawlToolContext,
    PageSnapshot,
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
        run = await self._get_current_run(job_id)
        self.assertEqual(run.status, CrawlJobStatus.NEEDS_REVIEW.value)
        self.assertIsNotNone(run.finished_at)
        self.assertIsNone(run.active_started_at)

    async def test_run_queued_crawl_job_accumulates_tokens_on_current_run(self) -> None:
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
                                    "usage_metadata={'input_tokens': 100, 'output_tokens': 20, 'total_tokens': 120}",
                                ]
                            }
                        },
                    }
                )
                await trace_callback(
                    {
                        "type": "updates",
                        "data": {
                            "model": {
                                "messages": [
                                    "response_metadata={'token_usage': {'completion_tokens': 12, 'prompt_tokens': 34, 'total_tokens': 46}}",
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

        with patch("app.services.crawl_job_runtime.run_faculty_crawler_agent", new=fake_run):
            processed = await run_queued_crawl_jobs_once(self.session_factory)

        self.assertEqual(processed, 1)
        run = await self._get_current_run(job_id)
        self.assertEqual(run.input_tokens, 134)
        self.assertEqual(run.output_tokens, 32)
        self.assertEqual(run.total_tokens, 166)

    async def test_worker_does_not_claim_paused_crawl_job(self) -> None:
        job_id = await self._create_default_profile_and_job()
        async with self.session_factory() as session:
            job = await session.get(CrawlJob, job_id)
            assert job is not None
            job.status = CrawlJobStatus.PAUSED.value
            await session.commit()

        processed = await run_queued_crawl_jobs_once(self.session_factory)

        self.assertEqual(processed, 0)
        job = await self._get_job(job_id)
        self.assertEqual(job.status, CrawlJobStatus.PAUSED.value)

    async def test_running_job_paused_by_tool_stays_paused(self) -> None:
        job_id = await self._create_default_profile_and_job()

        async def fake_run(
            ctx: CrawlToolContext,
            llm_profile: LLMProfile,
            trace_callback=None,
        ) -> dict[str, object]:
            _ = llm_profile, trace_callback
            async with ctx.session_factory() as session:
                job = await session.get(CrawlJob, ctx.job_id)
                assert job is not None
                job.status = CrawlJobStatus.PAUSED.value
                await session.commit()
            from app.services.crawler_tools import CrawlJobPaused

            raise CrawlJobPaused()

        with patch("app.services.crawl_job_runtime.run_faculty_crawler_agent", new=fake_run):
            processed = await run_queued_crawl_jobs_once(self.session_factory)

        self.assertEqual(processed, 1)
        job = await self._get_job(job_id)
        self.assertEqual(job.status, CrawlJobStatus.PAUSED.value)
        self.assertIsNone(job.error_message)
        run = await self._get_current_run(job_id)
        self.assertEqual(run.status, CrawlJobStatus.PAUSED.value)
        self.assertIsNone(run.active_started_at)

    async def test_enrichment_stops_when_job_is_paused(self) -> None:
        job_id = await self._create_default_profile_and_job(
            start_url="https://example.edu/faculty",
        )
        enrichment_calls: list[str] = []

        async def fake_run(
            ctx: CrawlToolContext,
            llm_profile: LLMProfile,
            trace_callback=None,
        ) -> dict[str, object]:
            _ = llm_profile, trace_callback
            await save_candidates(
                ctx,
                [
                    ProfessorCandidatePayload(
                        name="张三",
                        email="zhang@example.edu",
                        profile_url="https://example.edu/zhang",
                    )
                ],
            )
            async with ctx.session_factory() as session:
                job = await session.get(CrawlJob, ctx.job_id)
                assert job is not None
                job.status = CrawlJobStatus.PAUSED.value
                await session.commit()
            return {}

        async def fake_crawl_page_with_crawl4ai(
            ctx: CrawlToolContext,
            url: str,
            *,
            intent: str = "generic",
        ) -> PageSnapshot:
            _ = ctx, intent
            enrichment_calls.append(url)
            return PageSnapshot(
                url=url,
                title="张三",
                text="院系：计算机学院",
                html="<html></html>",
                links=[],
                fetch_method="http",
                status="succeeded",
            )

        with patch(
            "app.services.crawl_job_runtime.run_faculty_crawler_agent",
            new=fake_run,
        ), patch(
            "app.services.crawl_job_runtime.crawl_page_with_crawl4ai",
            new=fake_crawl_page_with_crawl4ai,
        ):
            processed = await run_queued_crawl_jobs_once(self.session_factory)

        self.assertEqual(processed, 1)
        self.assertEqual(enrichment_calls, [])
        job = await self._get_job(job_id)
        self.assertEqual(job.status, CrawlJobStatus.PAUSED.value)

    async def test_discovery_stage_saves_candidates_without_detail_fields(self) -> None:
        job_id = await self._create_default_profile_and_job(
            start_url="https://example.edu/faculty/list",
        )

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
                        name="李四",
                        email="li.si@example.edu",
                        title="副教授",
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
        async with self.session_factory() as session:
            candidate = await session.scalar(
                select(CrawlCandidate).where(CrawlCandidate.job_id == job_id)
            )
            self.assertIsNotNone(candidate)
            assert candidate is not None
            self.assertIsNone(candidate.department)
            self.assertIsNone(candidate.research_direction)
            self.assertEqual(candidate.recent_papers, [])
            self.assertIsNone(candidate.profile_url)

    async def test_profile_entry_type_extracts_single_candidate(self) -> None:
        job_id = await self._create_default_profile_and_job(
            start_url="https://example.edu/faculty/zhang",
            entry_type="profile",
        )
        calls: list[tuple[str, str]] = []

        async def fake_crawl_page_with_crawl4ai(
            ctx: CrawlToolContext,
            url: str,
            *,
            intent: str = "generic",
        ) -> PageSnapshot:
            _ = ctx
            calls.append((url, intent))
            return PageSnapshot(
                url="https://example.edu/faculty/zhang",
                title="张三",
                text="张三\n教授\n邮箱：zhang@example.edu\n研究方向：机器学习",
                html="<html></html>",
                links=[],
                fetch_method="http",
                status="succeeded",
            )

        async def fake_extract_profile_candidate_with_llm(
            ctx: CrawlToolContext,
            llm_profile: LLMProfile,
            page_text: str,
        ) -> ProfessorCandidatePayload:
            _ = llm_profile, page_text
            return ProfessorCandidatePayload(
                name="张三",
                email="zhang@example.edu",
                title="教授",
                research_direction="机器学习",
                profile_url=ctx.start_url,
                source_url=ctx.start_url,
                confidence=0.9,
            )

        with patch(
            "app.services.crawl_job_runtime.crawl_page_with_crawl4ai",
            new=fake_crawl_page_with_crawl4ai,
        ), patch(
            "app.services.crawl_job_runtime.extract_profile_candidate_with_llm",
            new=fake_extract_profile_candidate_with_llm,
        ):
            processed = await run_queued_crawl_jobs_once(self.session_factory)

        self.assertEqual(processed, 1)
        self.assertEqual(calls, [("https://example.edu/faculty/zhang", "profile")])
        job = await self._get_job(job_id)
        self.assertEqual(job.status, CrawlJobStatus.NEEDS_REVIEW.value)
        async with self.session_factory() as session:
            candidate = await session.scalar(
                select(CrawlCandidate).where(CrawlCandidate.job_id == job_id)
            )
            self.assertIsNotNone(candidate)
            assert candidate is not None
            self.assertEqual(candidate.name, "张三")
            self.assertEqual(candidate.university, "示例大学")
            self.assertEqual(candidate.school, "计算机学院")
            self.assertEqual(candidate.profile_url, "https://example.edu/faculty/zhang")

    async def test_profile_entry_type_fails_when_page_fetch_fails(self) -> None:
        job_id = await self._create_default_profile_and_job(
            start_url="https://example.edu/faculty/zhang",
            entry_type="profile",
        )

        async def fake_crawl_page_with_crawl4ai(
            ctx: CrawlToolContext,
            url: str,
            *,
            intent: str = "generic",
        ) -> PageSnapshot:
            _ = ctx, url, intent
            return PageSnapshot(
                url="https://example.edu/faculty/zhang",
                title=None,
                text="",
                html="",
                links=[],
                fetch_method="http",
                status="failed",
                error_message="详情页抓取失败",
            )

        with patch(
            "app.services.crawl_job_runtime.crawl_page_with_crawl4ai",
            new=fake_crawl_page_with_crawl4ai,
        ):
            await run_queued_crawl_jobs_once(self.session_factory)

        job = await self._get_job(job_id)
        self.assertEqual(job.status, CrawlJobStatus.FAILED.value)
        self.assertEqual(job.error_message, "详情页抓取失败")

    async def test_profile_entry_type_fails_when_name_is_missing(self) -> None:
        job_id = await self._create_default_profile_and_job(
            start_url="https://example.edu/faculty/unknown",
            entry_type="profile",
        )

        async def fake_crawl_page_with_crawl4ai(
            ctx: CrawlToolContext,
            url: str,
            *,
            intent: str = "generic",
        ) -> PageSnapshot:
            _ = ctx, url, intent
            return PageSnapshot(
                url="https://example.edu/faculty/unknown",
                title="Profile",
                text="研究方向：机器学习",
                html="<html></html>",
                links=[],
                fetch_method="http",
                status="succeeded",
            )

        async def fake_extract_profile_candidate_with_llm(
            ctx: CrawlToolContext,
            llm_profile: LLMProfile,
            page_text: str,
        ) -> ProfessorCandidatePayload:
            _ = ctx, llm_profile, page_text
            raise ValueError("未能从详情页识别导师信息")

        with patch(
            "app.services.crawl_job_runtime.crawl_page_with_crawl4ai",
            new=fake_crawl_page_with_crawl4ai,
        ), patch(
            "app.services.crawl_job_runtime.extract_profile_candidate_with_llm",
            new=fake_extract_profile_candidate_with_llm,
        ):
            await run_queued_crawl_jobs_once(self.session_factory)

        job = await self._get_job(job_id)
        self.assertEqual(job.status, CrawlJobStatus.FAILED.value)
        self.assertEqual(job.error_message, "未能从详情页识别导师信息")

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
        run = await self._get_current_run(job_id)
        self.assertEqual(run.status, CrawlJobStatus.FAILED.value)
        self.assertIsNotNone(run.error_message)
        self.assertIsNotNone(run.finished_at)

    async def test_run_queued_crawl_job_fails_when_save_failure_budget_is_exceeded(self) -> None:
        job_id = await self._create_default_profile_and_job()

        async def fake_run(
            ctx: CrawlToolContext,
            llm_profile: LLMProfile,
            trace_callback=None,
        ) -> dict[str, object]:
            _ = ctx, llm_profile, trace_callback
            raise CrawlJobSaveBudgetExceeded(
                terminal_reason="同一候选批次连续保存失败 2 次，已停止以避免继续消耗 token",
                failure_fingerprint="abc123def456",
                same_batch_save_failures=2,
                total_save_failures=2,
                latest_failure_summary="张三: name: Field required",
            )

        with patch(
            "app.services.crawl_job_runtime.run_faculty_crawler_agent",
            new=fake_run,
        ):
            processed = await run_queued_crawl_jobs_once(self.session_factory)

        self.assertEqual(processed, 1)
        job = await self._get_job(job_id)
        self.assertEqual(job.status, CrawlJobStatus.FAILED.value)
        self.assertIsNotNone(job.error_message)
        self.assertIn("同一候选批次连续保存失败 2 次", job.error_message)
        self.assertIn("张三: name: Field required", job.error_message)
        run = await self._get_current_run(job_id)
        self.assertEqual(run.status, CrawlJobStatus.FAILED.value)
        self.assertEqual(run.error_message, job.error_message)
        self.assertIsNotNone(run.finished_at)

        trace_events = [item for item in job.agent_trace or [] if isinstance(item, dict)]
        breaker_events = [
            item
            for item in trace_events
            if item.get("event_type") == "save_failure_circuit_breaker"
        ]
        self.assertEqual(len(breaker_events), 1)
        raw_event = breaker_events[0]["raw"]
        self.assertIsInstance(raw_event, dict)
        assert isinstance(raw_event, dict)
        self.assertEqual(raw_event["failure_fingerprint"], "abc123def456")
        self.assertEqual(raw_event["consecutive_same_batch_failures"], 2)
        self.assertEqual(raw_event["total_save_failures"], 2)

    async def test_run_queued_crawl_job_surfaces_latest_page_failure_when_no_candidates_saved(self) -> None:
        job_id = await self._create_default_profile_and_job()

        async def fake_run(
            ctx: CrawlToolContext,
            llm_profile: LLMProfile,
            trace_callback=None,
        ) -> dict[str, object]:
            _ = llm_profile, trace_callback
            async with ctx.session_factory() as session:
                session.add(
                    CrawlPage(
                        job_id=ctx.job_id,
                        url=ctx.start_url,
                        fetch_method="browser",
                        page_type="list",
                        status="failed",
                        error_message="Crawl4AI browser fetch failed: NotImplementedError",
                    )
                )
                await session.commit()
            return {}

        with patch(
            "app.services.crawl_job_runtime.run_faculty_crawler_agent",
            new=fake_run,
        ):
            processed = await run_queued_crawl_jobs_once(self.session_factory)

        self.assertEqual(processed, 1)
        job = await self._get_job(job_id)
        self.assertEqual(job.status, CrawlJobStatus.FAILED.value)
        self.assertEqual(
            job.error_message,
            "Crawl4AI browser fetch failed: NotImplementedError",
        )
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

    async def test_run_queued_crawl_job_does_not_auto_enrich_profiles_after_discovery(self) -> None:
        job_id = await self._create_default_profile_and_job(
            start_url="https://cai.jxufe.edu.cn/lists/26.html",
        )
        sequence: list[str] = []

        async def fake_run(
            ctx: CrawlToolContext,
            llm_profile: LLMProfile,
            trace_callback=None,
        ) -> dict[str, object]:
            _ = llm_profile
            sequence.append("discover")
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
                        title="教授、博导",
                        profile_url="https://cta.jxufe.edu.cn/home/teacherInfo/detail?uid=1",
                    )
                ],
            )
            return {}

        async def fake_crawl_page_with_crawl4ai(
            ctx: CrawlToolContext,
            url: str,
            *,
            intent: str = "generic",
        ) -> PageSnapshot:
            _ = ctx
            sequence.append(f"enrich:{url}:{intent}")
            return PageSnapshot(
                url=url,
                title="张三",
                text="院系：计算机科学系\n研究方向：大语言模型、智能体\n代表论文：Paper A；Paper B",
                html="<html></html>",
                links=[],
                fetch_method="http",
                status="succeeded",
            )

        async def fake_enrich_with_llm(
            ctx: CrawlToolContext,
            llm_profile: LLMProfile,
            candidate: CrawlCandidate,
            page_text: str,
        ) -> CandidateEnrichmentPayload:
            _ = ctx, llm_profile, candidate, page_text
            return CandidateEnrichmentPayload(
                department="计算机科学系",
                research_direction="大语言模型、智能体",
                recent_papers=["Paper A", "Paper B"],
            )

        with patch(
            "app.services.crawl_job_runtime.run_faculty_crawler_agent",
            new=fake_run,
        ), patch(
            "app.services.crawl_job_runtime.crawl_page_with_crawl4ai",
            new=fake_crawl_page_with_crawl4ai,
        ), patch(
            "app.services.crawl_job_runtime.enrich_candidate_profile_with_llm",
            new=fake_enrich_with_llm,
        ):
            processed = await run_queued_crawl_jobs_once(self.session_factory)

        self.assertEqual(processed, 1)
        self.assertEqual(sequence, ["discover"])
        job = await self._get_job(job_id)
        self.assertEqual(job.status, CrawlJobStatus.NEEDS_REVIEW.value)
        trace_messages = [
            item.get("message")
            for item in job.agent_trace or []
            if isinstance(item, dict)
        ]
        self.assertNotIn("开始统一补全候选导师详情，共 1 位待补全", trace_messages)
        self.assertNotIn("开始补全候选导师详情：张三", trace_messages)

        async with self.session_factory() as session:
            candidate = await session.scalar(
                select(CrawlCandidate).where(CrawlCandidate.job_id == job_id)
            )
            self.assertIsNotNone(candidate)
            assert candidate is not None
            self.assertIsNone(candidate.research_direction)
            self.assertIsNone(candidate.department)
            self.assertEqual(candidate.recent_papers, [])

    async def test_enrich_saved_candidates_fills_candidate_email_when_missing(self) -> None:
        job_id = await self._create_default_profile_and_job(
            start_url="https://cai.jxufe.edu.cn/lists/26.html",
        )
        ctx = CrawlToolContext(
            job_id=job_id,
            start_url="https://cai.jxufe.edu.cn/lists/26.html",
            university="示例大学",
            school="计算机学院",
            session_factory=self.session_factory,
        )
        await save_candidates(
            ctx,
            [
                ProfessorCandidatePayload(
                    name="王五",
                    email=None,
                    title="教授、博导",
                    department="计算机学院",
                    research_direction="网络安全",
                    recent_papers=["Paper X"],
                    profile_url="https://cta.jxufe.edu.cn/home/teacherInfo/detail?uid=3",
                )
            ],
        )
        llm_profile = await self._get_default_llm_profile()

        async def fake_crawl_page_with_crawl4ai(
            ctx: CrawlToolContext,
            url: str,
            *,
            intent: str = "generic",
        ) -> PageSnapshot:
            _ = ctx, intent
            return PageSnapshot(
                url=url,
                title="王五",
                text="邮箱：wang5 (AT) example DOT edu\n院系：计算机学院\n研究方向：教育学",
                html="<html></html>",
                links=[],
                fetch_method="http",
                status="succeeded",
            )

        async def fake_enrich_with_llm(
            ctx: CrawlToolContext,
            llm_profile: LLMProfile,
            candidate: CrawlCandidate,
            page_text: str,
        ) -> CandidateEnrichmentPayload:
            _ = ctx, llm_profile, candidate, page_text
            return CandidateEnrichmentPayload()

        with patch(
            "app.services.crawl_job_runtime.crawl_page_with_crawl4ai",
            new=fake_crawl_page_with_crawl4ai,
        ), patch(
            "app.services.crawl_job_runtime.enrich_candidate_profile_with_llm",
            new=fake_enrich_with_llm,
        ):
            await _enrich_saved_candidates(
                self.session_factory,
                ctx,
                llm_profile=llm_profile,
            )

        async with self.session_factory() as session:
            candidate = await session.scalar(
                select(CrawlCandidate).where(CrawlCandidate.job_id == job_id)
            )
            self.assertIsNotNone(candidate)
            assert candidate is not None
            self.assertEqual(candidate.email, "wang5@example.edu")

    async def test_run_queued_crawl_job_does_not_overwrite_existing_email(self) -> None:
        job_id = await self._create_default_profile_and_job(
            start_url="https://cai.jxufe.edu.cn/lists/26.html",
        )

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
                        name="赵六",
                        email="existing@example.edu",
                        title="教授",
                        profile_url="https://cta.jxufe.edu.cn/home/teacherInfo/detail?uid=4",
                    )
                ],
            )
            return {}

        async def fake_crawl_page_with_crawl4ai(
            ctx: CrawlToolContext,
            url: str,
            *,
            intent: str = "generic",
        ) -> PageSnapshot:
            _ = ctx, intent
            return PageSnapshot(
                url=url,
                title="赵六",
                text="邮箱：replace@other.example.edu\n院系：法学院\n研究方向：法学",
                html="<html></html>",
                links=[],
                fetch_method="http",
                status="succeeded",
            )

        async def fake_enrich_with_llm(
            ctx: CrawlToolContext,
            llm_profile: LLMProfile,
            candidate: CrawlCandidate,
            page_text: str,
        ) -> CandidateEnrichmentPayload:
            _ = ctx, llm_profile, candidate, page_text
            return CandidateEnrichmentPayload(email="replace@other.example.edu")

        with patch(
            "app.services.crawl_job_runtime.run_faculty_crawler_agent",
            new=fake_run,
        ), patch(
            "app.services.crawl_job_runtime.crawl_page_with_crawl4ai",
            new=fake_crawl_page_with_crawl4ai,
        ), patch(
            "app.services.crawl_job_runtime.enrich_candidate_profile_with_llm",
            new=fake_enrich_with_llm,
        ):
            await run_queued_crawl_jobs_once(self.session_factory)

        async with self.session_factory() as session:
            candidate = await session.scalar(
                select(CrawlCandidate).where(CrawlCandidate.job_id == job_id)
            )
            self.assertIsNotNone(candidate)
            assert candidate is not None
            self.assertEqual(candidate.email, "existing@example.edu")

    async def test_enrich_saved_candidates_records_failure_events(self) -> None:
        job_id = await self._create_default_profile_and_job(
            start_url="https://cai.jxufe.edu.cn/lists/26.html",
        )
        ctx = CrawlToolContext(
            job_id=job_id,
            start_url="https://cai.jxufe.edu.cn/lists/26.html",
            university="示例大学",
            school="计算机学院",
            session_factory=self.session_factory,
        )
        await save_candidates(
            ctx,
            [
                ProfessorCandidatePayload(
                    name="张三",
                    email="zhang@example.edu",
                    title="教授、博导",
                    profile_url="https://cta.jxufe.edu.cn/home/teacherInfo/detail?uid=1",
                )
            ],
        )
        llm_profile = await self._get_default_llm_profile()
        trace_events: list[dict[str, object]] = []

        async def trace_callback(event: dict[str, object]) -> None:
            trace_events.append(event)

        async def fake_crawl_page_with_crawl4ai(
            ctx: CrawlToolContext,
            url: str,
            *,
            intent: str = "generic",
        ) -> PageSnapshot:
            _ = ctx, url, intent
            return PageSnapshot(
                url="https://cta.jxufe.edu.cn/home/teacherInfo/detail?uid=1",
                title="张三",
                text="",
                html="",
                links=[],
                fetch_method="http",
                status="failed",
                error_message="详情页抓取失败",
            )

        with patch(
            "app.services.crawl_job_runtime.crawl_page_with_crawl4ai",
            new=fake_crawl_page_with_crawl4ai,
        ):
            enriched_count = await _enrich_saved_candidates(
                self.session_factory,
                ctx,
                llm_profile=llm_profile,
                trace_callback=trace_callback,
            )

        self.assertEqual(enriched_count, 0)
        trace_messages = [
            item.get("message")
            for item in trace_events
            if isinstance(item, dict)
        ]
        self.assertIn("开始统一补全候选导师详情，共 1 位待补全", trace_messages)
        self.assertIn("候选导师详情补全失败：张三", trace_messages)
        self.assertIn("候选导师详情补全完成：成功 0 位，未变化 0 位，失败 1 位", trace_messages)

    async def test_enrich_saved_candidates_falls_back_to_rules_when_llm_returns_empty(self) -> None:
        job_id = await self._create_default_profile_and_job(
            start_url="https://cai.jxufe.edu.cn/lists/26.html",
        )
        ctx = CrawlToolContext(
            job_id=job_id,
            start_url="https://cai.jxufe.edu.cn/lists/26.html",
            university="示例大学",
            school="计算机学院",
            session_factory=self.session_factory,
        )
        await save_candidates(
            ctx,
            [
                ProfessorCandidatePayload(
                    name="王五",
                    email="wang.wu@example.edu",
                    title="教授、博导",
                    profile_url="https://cta.jxufe.edu.cn/home/teacherInfo/detail?uid=2",
                )
            ],
        )
        llm_profile = await self._get_default_llm_profile()

        async def fake_crawl_page_with_crawl4ai(
            ctx: CrawlToolContext,
            url: str,
            *,
            intent: str = "generic",
        ) -> PageSnapshot:
            _ = ctx, intent
            return PageSnapshot(
                url=url,
                title="王五",
                text="院系：人工智能学院\n研究方向：具身智能\n代表论文：Paper X；Paper Y",
                html="<html></html>",
                links=[],
                fetch_method="http",
                status="succeeded",
            )

        async def fake_enrich_with_llm(
            ctx: CrawlToolContext,
            llm_profile: LLMProfile,
            candidate: CrawlCandidate,
            page_text: str,
        ) -> CandidateEnrichmentPayload:
            _ = ctx, llm_profile, candidate, page_text
            return CandidateEnrichmentPayload()

        with patch(
            "app.services.crawl_job_runtime.crawl_page_with_crawl4ai",
            new=fake_crawl_page_with_crawl4ai,
        ), patch(
            "app.services.crawl_job_runtime.enrich_candidate_profile_with_llm",
            new=fake_enrich_with_llm,
        ):
            enriched_count = await _enrich_saved_candidates(
                self.session_factory,
                ctx,
                llm_profile=llm_profile,
            )

        self.assertEqual(enriched_count, 1)
        async with self.session_factory() as session:
            candidate = await session.scalar(
                select(CrawlCandidate).where(CrawlCandidate.job_id == job_id)
            )
            self.assertIsNotNone(candidate)
            assert candidate is not None
            self.assertEqual(candidate.department, "人工智能学院")
            self.assertEqual(candidate.research_direction, "具身智能")
            self.assertEqual(candidate.recent_papers, ["Paper X", "Paper Y"])

    async def _create_default_profile_and_job(
        self,
        *,
        start_url: str = "https://example.edu/faculty",
        entry_type: str = "list",
    ) -> int:
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
                start_url=start_url,
                entry_type=entry_type,
                status=CrawlJobStatus.QUEUED.value,
                progress_current=0,
                progress_total=0,
            )
            session.add(profile)
            session.add(job)
            await session.flush()
            await create_initial_crawl_job_run(session, job)
            await session.commit()
            await session.refresh(job)
            return job.id

    async def _get_default_llm_profile(self) -> LLMProfile:
        async with self.session_factory() as session:
            profile = await session.scalar(
                select(LLMProfile)
                .where(LLMProfile.is_default.is_(True))
                .limit(1)
            )
            if profile is None:
                raise AssertionError("default LLM profile not found")
            return profile

    async def _get_current_run(self, job_id: int) -> CrawlJobRun:
        async with self.session_factory() as session:
            job = await session.get(CrawlJob, job_id)
            if job is None or job.current_run_id is None:
                raise AssertionError(f"crawl job {job_id} current run not found")
            run = await session.get(CrawlJobRun, job.current_run_id)
            if run is None:
                raise AssertionError(f"crawl job run {job.current_run_id} not found")
            return run

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
