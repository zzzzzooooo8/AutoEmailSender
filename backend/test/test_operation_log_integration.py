from __future__ import annotations

import asyncio
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient


BACKEND_DIR = Path(__file__).resolve().parents[1]


class OperationLogIntegrationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "operation_log_integration.db"
        os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{self.db_path.as_posix()}"
        os.environ["ENABLE_BACKGROUND_WORKERS"] = "0"
        self._run_alembic_upgrade()
        self.getaddrinfo_patcher = patch(
            "app.services.crawler_tools.socket.getaddrinfo",
            return_value=[(0, 0, 0, "", ("93.184.216.34", 443))],
        )
        self.getaddrinfo_patcher.start()

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
        self.getaddrinfo_patcher.stop()
        self.temp_dir.cleanup()

    def test_create_crawl_job_records_operation_log_with_response_request_id(self) -> None:
        response = self.client.post(
            "/api/crawl-jobs",
            headers={"X-Request-ID": "oplog.crawl-1"},
            json={
                "university": "示例大学",
                "school": "计算机学院",
                "start_url": "https://example.edu/faculty",
                "llm_profile_id": None,
            },
        )

        self.assertEqual(response.status_code, 201, msg=response.text)
        request_id = response.headers["X-Request-ID"]
        logs = self._list_logs("crawl_job.created", request_id=request_id)

        self.assertEqual(len(logs), 1)
        log = logs[0]
        self.assertEqual(log["category"], "crawler")
        self.assertEqual(log["entity_type"], "crawl_job")
        self.assertEqual(log["entity_id"], str(response.json()["id"]))
        self.assertEqual(log["metadata"]["university"], "示例大学")
        self.assertEqual(log["metadata"]["school"], "计算机学院")
        self.assertEqual(log["metadata"]["start_url"], "https://example.edu/faculty")
        self.assertIsNone(log["metadata"]["llm_profile_id"])

    def test_create_batch_task_records_target_count_metadata(self) -> None:
        identity_id = self._create_identity("batch-sender@example.com")
        llm_profile_id = self._create_llm_profile("批量任务模型")
        first_professor_id = self._create_professor("一号导师", "batch-one@example.edu")
        second_professor_id = self._create_professor("二号导师", "batch-two@example.edu")

        response = self.client.post(
            "/api/batch-tasks",
            json={
                "identity_id": identity_id,
                "llm_profile_id": llm_profile_id,
                "name": "测试批量任务",
                "professor_ids": [first_professor_id, second_professor_id],
                "schedule_type": "immediate",
                "window_start_time": None,
                "window_end_time": None,
                "emails_per_window": None,
                "primary_material_id": None,
                "email_subject": "联系 {{name}}",
                "email_body": "正文 {{name}}",
                "selected_material_ids": None,
            },
        )

        self.assertEqual(response.status_code, 201, msg=response.text)
        logs = self._list_logs("batch_task.created", entity_id=str(response.json()["id"]))

        self.assertEqual(len(logs), 1)
        self.assertEqual(logs[0]["category"], "email")
        self.assertEqual(logs[0]["entity_type"], "batch_task")
        self.assertEqual(logs[0]["metadata"]["target_count"], 2)
        self.assertEqual(logs[0]["metadata"]["identity_id"], identity_id)
        self.assertEqual(logs[0]["metadata"]["llm_profile_id"], llm_profile_id)
        self.assertEqual(logs[0]["metadata"]["schedule_type"], "immediate")

    def test_professor_create_and_archive_record_operation_logs(self) -> None:
        create_response = self.client.post(
            "/api/professors",
            json=self._professor_payload("归档导师", "archive-me@example.edu"),
        )
        self.assertEqual(create_response.status_code, 201, msg=create_response.text)
        professor_id = create_response.json()["id"]

        archive_response = self.client.post(f"/api/professors/{professor_id}/archive")

        self.assertEqual(archive_response.status_code, 200, msg=archive_response.text)
        create_logs = self._list_logs("professor.created", entity_id=str(professor_id))
        archive_logs = self._list_logs("professor.archived", entity_id=str(professor_id))
        self.assertEqual(len(create_logs), 1)
        self.assertEqual(len(archive_logs), 1)
        self.assertEqual(create_logs[0]["category"], "user_action")
        self.assertEqual(archive_logs[0]["metadata"]["affected_count"], 1)

    def test_llm_profile_test_records_failed_result_without_sensitive_fields(self) -> None:
        llm_profile_id = self._create_llm_profile("测试模型", api_key="sk-sensitive-test-key")

        with patch(
            "app.api.llm_profiles.probe_llm_profile",
            AsyncMock(return_value=self._build_probe_result()),
        ):
            response = self.client.post(f"/api/llm-profiles/{llm_profile_id}/test")

        self.assertEqual(response.status_code, 200, msg=response.text)
        logs = self._list_logs("llm_profile.tested", entity_id=str(llm_profile_id))

        self.assertEqual(len(logs), 1)
        metadata = logs[0]["metadata"]
        self.assertFalse(metadata["ok"])
        self.assertEqual(metadata["status_code"], 401)
        self.assertEqual(metadata["duration_ms"], 12)
        self.assertEqual(metadata["provider"], "openai")
        self.assertNotIn("api_key", metadata)
        self.assertNotIn("sk-sensitive-test-key", str(metadata))

    def _list_logs(
        self,
        event_name: str,
        *,
        request_id: str | None = None,
        entity_id: str | None = None,
    ) -> list[dict[str, object]]:
        params: dict[str, str] = {"event_name": event_name}
        if request_id is not None:
            params["request_id"] = request_id
        if entity_id is not None:
            params["entity_id"] = entity_id
        response = self.client.get("/api/diagnostics/operation-logs", params=params)
        self.assertEqual(response.status_code, 200, msg=response.text)
        return response.json()["items"]

    def _create_identity(self, email: str) -> int:
        response = self.client.post(
            "/api/identities",
            json={
                "name": "测试身份",
                "email_address": email,
                "smtp_host": "smtp.example.com",
                "smtp_port": 465,
                "smtp_username": email,
                "smtp_password": "smtp-secret",
                "imap_host": None,
                "imap_port": None,
                "imap_username": None,
                "imap_password": None,
                "default_language": "zh-CN",
                "outreach_generation_mode": "llm",
                "outreach_template_subject": "申请与{{name}}老师交流",
                "outreach_template_body_text": "老师您好，我是{{sender_name}}。",
                "outreach_template_body_html": None,
                "match_threshold": None,
                "daily_send_limit": None,
                "send_interval_min": None,
                "send_interval_max": None,
                "same_domain_cooldown_minutes": None,
                "is_default": True,
            },
        )
        self.assertEqual(response.status_code, 201, msg=response.text)
        return response.json()["id"]

    def _create_llm_profile(self, name: str, *, api_key: str = "sk-test-key") -> int:
        response = self.client.post(
            "/api/llm-profiles",
            json={
                "name": name,
                "provider": "openai",
                "api_base_url": "https://api.example.com/v1",
                "api_key": api_key,
                "model_name": "gpt-4o-mini",
                "matcher_prompt_template": "matcher",
                "writer_prompt_template": "writer",
                "temperature": 0.2,
                "max_tokens": 2048,
                "is_default": True,
            },
        )
        self.assertEqual(response.status_code, 201, msg=response.text)
        return response.json()["id"]

    def _create_professor(self, name: str, email: str) -> int:
        response = self.client.post("/api/professors", json=self._professor_payload(name, email))
        self.assertEqual(response.status_code, 201, msg=response.text)
        return response.json()["id"]

    @staticmethod
    def _professor_payload(name: str, email: str) -> dict[str, object]:
        return {
            "name": name,
            "email": email,
            "title": "Professor",
            "university": "Example University",
            "school": "School of Computing",
            "department": "Computer Science",
            "research_direction": "Agent systems",
            "recent_papers": [],
            "profile_url": None,
            "source_url": None,
        }

    @staticmethod
    def _build_probe_result():
        from app.services.llm_runtime import LLMProbeResult

        return LLMProbeResult(
            ok=False,
            message="认证失败",
            resolved_base_url="https://api.example.com/v1",
            request_url="https://api.example.com/v1/chat/completions?api_key=secret",
            attempted_urls=["https://api.example.com/v1/chat/completions?api_key=secret"],
            endpoint_kind="chat",
            status_code=401,
            duration_ms=12,
            consumes_tokens=True,
            prompt_tokens=None,
            completion_tokens=None,
            total_tokens=None,
            response_preview=None,
        )

    def _run_alembic_upgrade(self) -> None:
        result = subprocess.run(
            [sys.executable, "-m", "alembic", "upgrade", "head"],
            cwd=BACKEND_DIR,
            env=os.environ.copy(),
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
