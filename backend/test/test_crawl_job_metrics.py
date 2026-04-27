from __future__ import annotations

import unittest
from datetime import UTC, datetime

from app.models import CrawlJob, CrawlJobStatus
from app.services.crawl_job_metrics import build_crawl_job_metrics


class CrawlJobMetricsTests(unittest.TestCase):
    def test_build_metrics_aggregates_token_usage_and_duration(self) -> None:
        job = CrawlJob(
            id=1,
            university="示例大学",
            school="计算机学院",
            start_url="https://example.edu/faculty",
            status=CrawlJobStatus.NEEDS_REVIEW.value,
            progress_current=0,
            progress_total=0,
            agent_trace=[
                {
                    "raw": {
                        "type": "updates",
                        "data": {
                            "model": {
                                "messages": [
                                    "usage_metadata={'input_tokens': 100, 'output_tokens': 20, 'total_tokens': 120}",
                                ]
                            }
                        },
                    }
                },
                {
                    "raw": {
                        "type": "updates",
                        "data": {
                            "model": {
                                "messages": [
                                    "usage_metadata={'input_tokens': 80, 'output_tokens': 15, 'total_tokens': 95}",
                                ]
                            }
                        },
                    }
                },
            ],
            created_at=datetime(2026, 4, 27, 10, 0, 0, tzinfo=UTC),
            updated_at=datetime(2026, 4, 27, 10, 1, 30, tzinfo=UTC),
        )

        metrics = build_crawl_job_metrics(job)

        self.assertEqual(metrics.input_tokens, 180)
        self.assertEqual(metrics.output_tokens, 35)
        self.assertEqual(metrics.total_tokens, 215)
        self.assertEqual(metrics.duration_seconds, 90)

    def test_build_metrics_falls_back_to_response_metadata_token_usage(self) -> None:
        job = CrawlJob(
            id=2,
            university="示例大学",
            school="计算机学院",
            start_url="https://example.edu/faculty",
            status=CrawlJobStatus.RUNNING.value,
            progress_current=0,
            progress_total=0,
            agent_trace=[
                {
                    "raw": {
                        "type": "updates",
                        "data": {
                            "model": {
                                "messages": [
                                    "response_metadata={'token_usage': {'completion_tokens': 12, 'prompt_tokens': 34, 'total_tokens': 46}}",
                                ]
                            }
                        },
                    }
                },
            ],
            created_at=datetime(2026, 4, 27, 10, 0, 0, tzinfo=UTC),
            updated_at=datetime(2026, 4, 27, 10, 0, 5, tzinfo=UTC),
        )

        metrics = build_crawl_job_metrics(job)

        self.assertEqual(metrics.input_tokens, 34)
        self.assertEqual(metrics.output_tokens, 12)
        self.assertEqual(metrics.total_tokens, 46)
        self.assertEqual(metrics.duration_seconds, 5)

    def test_build_metrics_handles_missing_trace(self) -> None:
        job = CrawlJob(
            id=3,
            university="示例大学",
            school="计算机学院",
            start_url="https://example.edu/faculty",
            status=CrawlJobStatus.QUEUED.value,
            progress_current=0,
            progress_total=0,
            agent_trace=None,
            created_at=datetime(2026, 4, 27, 10, 0, 0, tzinfo=UTC),
            updated_at=datetime(2026, 4, 27, 10, 0, 0, tzinfo=UTC),
        )

        metrics = build_crawl_job_metrics(job)

        self.assertEqual(metrics.input_tokens, 0)
        self.assertEqual(metrics.output_tokens, 0)
        self.assertEqual(metrics.total_tokens, 0)
        self.assertEqual(metrics.duration_seconds, 0)


if __name__ == "__main__":
    unittest.main()
