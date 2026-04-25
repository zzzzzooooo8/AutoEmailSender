from __future__ import annotations

import asyncio
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient


BACKEND_DIR = Path(__file__).resolve().parents[1]


class CrawlJobsApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "crawl_jobs_api_test.db"
        os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{self.db_path.as_posix()}"
        os.environ["ENABLE_BACKGROUND_WORKERS"] = "0"
        self._run_alembic_upgrade()

        from app.core.config import get_settings
        from app.core.database import dispose_engine, get_engine, get_session_factory
        from main import create_app

        get_settings.cache_clear()
        if get_engine.cache_info().currsize:
            asyncio.run(dispose_engine())
        get_session_factory.cache_clear()
        get_settings.cache_clear()

        self.client = TestClient(create_app())

    def tearDown(self) -> None:
        self.client.close()
        from app.core.config import get_settings
        from app.core.database import dispose_engine, get_engine, get_session_factory

        if get_engine.cache_info().currsize:
            asyncio.run(dispose_engine())
        get_session_factory.cache_clear()
        get_settings.cache_clear()
        os.environ.pop("DATABASE_URL", None)
        os.environ.pop("ENABLE_BACKGROUND_WORKERS", None)
        self.temp_dir.cleanup()

    def test_create_crawl_job_rejects_non_http_url(self) -> None:
        response = self.client.post(
            "/api/crawl-jobs",
            json={
                "university": "示例大学",
                "school": "计算机学院",
                "start_url": "ftp://example.edu/faculty",
                "llm_profile_id": None,
            },
        )

        self.assertEqual(response.status_code, 422)

    def test_crawl_job_review_flow(self) -> None:
        create_response = self.client.post(
            "/api/crawl-jobs",
            json={
                "university": "示例大学",
                "school": "计算机学院",
                "start_url": "https://example.edu/faculty",
                "llm_profile_id": None,
            },
        )
        self.assertEqual(create_response.status_code, 201, msg=create_response.text)
        job = create_response.json()
        self.assertEqual(job["status"], "queued")

        self._seed_page_and_candidates(job["id"])

        list_response = self.client.get("/api/crawl-jobs")
        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(list_response.json()[0]["id"], job["id"])

        detail_response = self.client.get(f"/api/crawl-jobs/{job['id']}")
        self.assertEqual(detail_response.status_code, 200)
        self.assertEqual(detail_response.json()["start_url"], "https://example.edu/faculty")

        pages_response = self.client.get(f"/api/crawl-jobs/{job['id']}/pages")
        self.assertEqual(pages_response.status_code, 200)
        self.assertEqual(pages_response.json()[0]["url"], "https://example.edu/faculty")

        candidates_response = self.client.get(f"/api/crawl-jobs/{job['id']}/candidates")
        self.assertEqual(candidates_response.status_code, 200)
        candidates = candidates_response.json()
        self.assertEqual([item["name"] for item in candidates], ["高分导师", "低分导师", "无邮箱导师"])
        self.assertEqual(candidates[1]["recent_papers"], [])

        patch_response = self.client.patch(
            f"/api/crawl-jobs/candidates/{candidates[1]['id']}",
            json={
                "name": "低分导师更新",
                "email": "low@example.edu",
                "title": "Associate Professor",
                "university": "示例大学",
                "school": "计算机学院",
                "department": "CS",
                "research_direction": "信息抽取",
                "recent_papers": ["Paper X"],
                "profile_url": "https://example.edu/low",
                "source_url": "https://example.edu/faculty",
                "review_status": "pending",
            },
        )
        self.assertEqual(patch_response.status_code, 200, msg=patch_response.text)
        self.assertEqual(patch_response.json()["name"], "低分导师更新")

        approve_response = self.client.post(
            f"/api/crawl-jobs/{job['id']}/approve",
            json={"candidate_ids": [item["id"] for item in candidates]},
        )
        self.assertEqual(approve_response.status_code, 200, msg=approve_response.text)
        self.assertEqual(approve_response.json()["inserted_count"], 2)
        self.assertEqual(approve_response.json()["skipped_count"], 1)
        self.assertIn("审核完成", approve_response.json()["message"])

        completed_response = self.client.get(f"/api/crawl-jobs/{job['id']}")
        self.assertEqual(completed_response.json()["status"], "completed")

        cancel_completed_response = self.client.post(f"/api/crawl-jobs/{job['id']}/cancel")
        self.assertEqual(cancel_completed_response.status_code, 200)
        self.assertEqual(cancel_completed_response.json()["status"], "completed")

    def test_approve_requires_candidate_ids(self) -> None:
        create_response = self.client.post(
            "/api/crawl-jobs",
            json={
                "university": "示例大学",
                "school": "计算机学院",
                "start_url": "https://example.edu/faculty",
                "llm_profile_id": None,
            },
        )
        self.assertEqual(create_response.status_code, 201, msg=create_response.text)

        response = self.client.post(
            f"/api/crawl-jobs/{create_response.json()['id']}/approve",
            json={"candidate_ids": []},
        )

        self.assertEqual(response.status_code, 400)

    def test_missing_crawl_job_returns_chinese_message(self) -> None:
        response = self.client.get("/api/crawl-jobs/999999")

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["detail"], "未找到抓取任务")

    def _seed_page_and_candidates(self, job_id: int) -> None:
        async def _seed() -> None:
            from app.core.database import get_session_factory
            from app.models import CrawlCandidate, CrawlPage, CrawlPageStatus

            async with get_session_factory()() as session:
                session.add(
                    CrawlPage(
                        job_id=job_id,
                        url="https://example.edu/faculty",
                        parent_url=None,
                        fetch_method="http",
                        page_type="faculty_list",
                        status=CrawlPageStatus.SUCCEEDED.value,
                        title="Faculty",
                        text_excerpt="Faculty page",
                        error_message=None,
                    ),
                )
                session.add_all(
                    [
                        CrawlCandidate(
                            job_id=job_id,
                            name="低分导师",
                            email="low@example.edu",
                            title="Assistant Professor",
                            university="示例大学",
                            school="计算机学院",
                            department="CS",
                            research_direction="数据库",
                            recent_papers=None,
                            profile_url="https://example.edu/low",
                            source_url="https://example.edu/faculty",
                            confidence=0.5,
                        ),
                        CrawlCandidate(
                            job_id=job_id,
                            name="高分导师",
                            email="high@example.edu",
                            title="Professor",
                            university="示例大学",
                            school="计算机学院",
                            department="CS",
                            research_direction="机器学习",
                            recent_papers=["Paper A"],
                            profile_url="https://example.edu/high",
                            source_url="https://example.edu/faculty",
                            confidence=0.9,
                        ),
                        CrawlCandidate(
                            job_id=job_id,
                            name="无邮箱导师",
                            email=None,
                            title="Professor",
                            university="示例大学",
                            school="计算机学院",
                            department="CS",
                            research_direction="系统",
                            recent_papers=[],
                            profile_url=None,
                            source_url="https://example.edu/faculty",
                            confidence=0.2,
                        ),
                    ],
                )
                await session.commit()

        asyncio.run(_seed())

    def _run_alembic_upgrade(self) -> None:
        env = os.environ.copy()
        result = subprocess.run(
            [sys.executable, "-m", "alembic", "upgrade", "head"],
            cwd=BACKEND_DIR,
            env=env,
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0:
            self.fail(
                "Alembic migration failed.\n"
                f"stdout:\n{result.stdout}\n"
                f"stderr:\n{result.stderr}",
            )


if __name__ == "__main__":
    unittest.main()
