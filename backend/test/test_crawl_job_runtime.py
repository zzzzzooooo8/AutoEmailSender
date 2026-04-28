from __future__ import annotations

import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.models import Base, CrawlCandidate, CrawlJob, CrawlJobStatus, CrawlPage, LLMProfile
from app.services.crawl_job_runtime import run_queued_crawl_jobs_once
from app.services.crawler_tools import (
    CandidateEnrichmentPayload,
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

    async def test_run_queued_crawl_job_enriches_profiles_after_discovery(self) -> None:
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
        self.assertEqual(
            sequence,
            ["discover", "enrich:https://cta.jxufe.edu.cn/home/teacherInfo/detail?uid=1:profile"],
        )
        job = await self._get_job(job_id)
        self.assertEqual(job.status, CrawlJobStatus.NEEDS_REVIEW.value)
        trace_messages = [
            item.get("message")
            for item in job.agent_trace or []
            if isinstance(item, dict)
        ]
        self.assertIn("开始统一补全候选导师详情，共 1 位待补全", trace_messages)
        self.assertIn("开始补全候选导师详情：张三", trace_messages)
        self.assertIn("候选导师详情补全成功：张三（院系、研究方向、近期论文）", trace_messages)
        self.assertIn("候选导师详情补全完成：成功 1 位，未变化 0 位，失败 0 位", trace_messages)

        async with self.session_factory() as session:
            candidate = await session.scalar(
                select(CrawlCandidate).where(CrawlCandidate.job_id == job_id)
            )
            self.assertIsNotNone(candidate)
            assert candidate is not None
            self.assertEqual(candidate.research_direction, "大语言模型、智能体")
            self.assertEqual(candidate.department, "计算机科学系")
            self.assertEqual(candidate.recent_papers, ["Paper A", "Paper B"])

    async def test_run_queued_crawl_job_enriches_candidate_email_when_missing(self) -> None:
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

    async def test_run_queued_crawl_job_records_enrichment_failure_events(self) -> None:
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
            "app.services.crawl_job_runtime.run_faculty_crawler_agent",
            new=fake_run,
        ), patch(
            "app.services.crawl_job_runtime.crawl_page_with_crawl4ai",
            new=fake_crawl_page_with_crawl4ai,
        ):
            processed = await run_queued_crawl_jobs_once(self.session_factory)

        self.assertEqual(processed, 1)
        job = await self._get_job(job_id)
        trace_messages = [
            item.get("message")
            for item in job.agent_trace or []
            if isinstance(item, dict)
        ]
        self.assertIn("开始统一补全候选导师详情，共 1 位待补全", trace_messages)
        self.assertIn("候选导师详情补全失败：张三", trace_messages)
        self.assertIn("候选导师详情补全完成：成功 0 位，未变化 0 位，失败 1 位", trace_messages)

    async def test_run_queued_crawl_job_enrichment_falls_back_to_rules_when_llm_returns_empty(self) -> None:
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
                        name="王五",
                        email="wang.wu@example.edu",
                        title="教授、博导",
                        profile_url="https://cta.jxufe.edu.cn/home/teacherInfo/detail?uid=2",
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
