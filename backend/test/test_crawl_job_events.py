from __future__ import annotations

import unittest
from datetime import UTC, datetime

from app.models import CrawlCandidate, CrawlJob, CrawlJobStatus, CrawlPage, CrawlPageStatus
from app.services.crawl_job_events import (
    build_crawl_job_events,
    normalize_agent_trace_event,
    summarize_agent_trace_event,
)


class CrawlJobEventsTests(unittest.TestCase):
    def test_build_events_includes_status_trace_page_and_candidate(self) -> None:
        job = CrawlJob(
            id=1,
            university="示例大学",
            school="计算机学院",
            start_url="https://example.edu/faculty",
            status=CrawlJobStatus.NEEDS_REVIEW.value,
            progress_current=1,
            progress_total=1,
            agent_trace=[
                {
                    "event_type": "tool_call",
                    "message": "调用 crawl_page 抓取入口页面",
                    "created_at": "2026-04-26T10:01:00+00:00",
                },
            ],
            created_at=datetime(2026, 4, 26, 10, 0, tzinfo=UTC),
            updated_at=datetime(2026, 4, 26, 10, 2, tzinfo=UTC),
        )
        pages = [
            CrawlPage(
                id=10,
                job_id=1,
                url="https://example.edu/faculty",
                parent_url=None,
                fetch_method="http",
                page_type="faculty_list",
                status=CrawlPageStatus.SUCCEEDED.value,
                title="Faculty",
                text_excerpt=None,
                error_message=None,
                created_at=datetime(2026, 4, 26, 10, 3, tzinfo=UTC),
            ),
        ]
        candidates = [
            CrawlCandidate(
                id=20,
                job_id=1,
                name="张教授",
                email="zhang@example.edu",
                title="Professor",
                university="示例大学",
                school="计算机学院",
                department="CS",
                research_direction=None,
                recent_papers=None,
                profile_url=None,
                source_url="https://example.edu/faculty",
                confidence=0.9,
                created_at=datetime(2026, 4, 26, 10, 4, tzinfo=UTC),
                updated_at=datetime(2026, 4, 26, 10, 4, tzinfo=UTC),
            ),
        ]

        events = build_crawl_job_events(job, pages=pages, candidates=candidates)

        messages = [event["message"] for event in events]
        self.assertIn("任务进入待审核", messages)
        self.assertIn("调用 crawl_page 抓取入口页面", messages)
        self.assertIn("已抓取页面：Faculty", messages)
        self.assertIn("发现候选导师：张教授", messages)
        for event in events:
            self.assertIn("id", event)
            self.assertEqual(event["job_id"], 1)
            self.assertIn("event_type", event)
            self.assertIn("created_at", event)
            self.assertIn("raw", event)

    def test_trace_without_message_uses_nested_name(self) -> None:
        message = summarize_agent_trace_event(
            {
                "event_type": "tool_call",
                "data": {
                    "tool": {
                        "name": "crawl_page",
                    },
                },
            },
        )

        self.assertEqual(message, "Agent 调用 crawl_page")

    def test_non_dict_and_empty_trace_do_not_raise(self) -> None:
        self.assertEqual(normalize_agent_trace_event({})["message"], "Agent 更新了执行状态")
        self.assertEqual(summarize_agent_trace_event({}), "Agent 更新了执行状态")
        self.assertEqual(summarize_agent_trace_event("not a dict"), "Agent 更新了执行状态")

        job = CrawlJob(
            id=2,
            university="示例大学",
            school="计算机学院",
            start_url="https://example.edu/faculty",
            status=CrawlJobStatus.QUEUED.value,
            progress_current=0,
            progress_total=0,
            agent_trace=[{}, "not a dict"],
            created_at=None,
            updated_at=None,
        )

        events = build_crawl_job_events(job, pages=[], candidates=[])

        self.assertIn("任务已排队", [event["message"] for event in events])


if __name__ == "__main__":
    unittest.main()
