from __future__ import annotations

import json
import os
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from app.services.outreach_templates import import_outreach_template_file


BACKEND_DIR = Path(__file__).resolve().parents[1]
HEAD_REVISION = "9c3d5b4a7f21"
LEGACY_RUNTIME_REVISION = "7a1d5e42c9bd"


class DatabaseSchemaTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "schema_test.db"
        self.env = os.environ.copy()
        self.env["DATABASE_URL"] = f"sqlite+aiosqlite:///{self.db_path.as_posix()}"

        self._run_alembic(self.env, "upgrade", "04d66ff4c25b")
        self._run_alembic(self.env, "upgrade", "head")

        self.connection = sqlite3.connect(self.db_path)
        self.connection.execute("PRAGMA foreign_keys = ON")

    def tearDown(self) -> None:
        self.connection.close()
        self.temp_dir.cleanup()

    def test_runtime_tables_and_columns_are_created(self) -> None:
        rows = self.connection.execute(
            """
            SELECT name
            FROM sqlite_master
            WHERE type = 'table'
            """,
        ).fetchall()
        table_names = {row[0] for row in rows}

        self.assertTrue(
            {
                "alembic_version",
                "identity_profiles",
                "identity_materials",
                "llm_profiles",
                "professors",
                "email_tasks",
                "batch_tasks",
                "email_logs",
                "app_settings",
                "test_compose_sessions",
                "test_compose_messages",
            }.issubset(table_names),
        )
        self.assertNotIn("attachment_assets", table_names)

        identity_columns = self._get_columns("identity_profiles")
        batch_columns = self._get_columns("batch_tasks")
        task_columns = self._get_columns("email_tasks")
        material_columns = self._get_columns("identity_materials")
        professor_columns = self._get_columns("professors")
        log_columns = self._get_columns("email_logs")
        settings_columns = self._get_columns("app_settings")

        self.assertIn("current_primary_material_id", identity_columns)
        self.assertNotIn("resume_file_path", identity_columns)
        self.assertNotIn("resume_text", identity_columns)
        self.assertIn("primary_material_id", batch_columns)
        self.assertIn("selected_material_ids", batch_columns)
        self.assertNotIn("selected_attachment_ids", batch_columns)
        self.assertIn("primary_material_id", task_columns)
        self.assertIn("selected_material_ids", task_columns)
        self.assertNotIn("selected_attachments", task_columns)
        self.assertIn("display_name", material_columns)
        self.assertIn("original_filename", material_columns)
        self.assertIn("sha256", material_columns)
        self.assertIn("material_type", material_columns)
        self.assertIn("archived_at", professor_columns)
        self.assertIn("provider_payload", log_columns)
        self.assertIn("reply_headers", log_columns)
        self.assertNotIn("mail_delivery_mode", settings_columns)
        self.assertNotIn("signature", identity_columns)

    def test_html_template_import_derives_text_from_sanitized_html(self) -> None:
        imported = import_outreach_template_file(
            "template.html",
            b'<p>Hello <strong>{{name}}</strong></p><script>alert(1)</script>',
        )

        self.assertEqual(imported.body_html, "<p>Hello <strong>{{name}}</strong></p>")
        self.assertEqual(imported.body_text, "Hello {{name}}")

    def test_old_revision_can_upgrade_to_head(self) -> None:
        version = self.connection.execute(
            "SELECT version_num FROM alembic_version",
        ).fetchone()[0]
        self.assertEqual(version, HEAD_REVISION)

    def test_defaults_and_foreign_keys_work(self) -> None:
        identity_id = self._insert_identity()
        llm_profile_id = self._insert_llm_profile()
        professor_id = self._insert_professor("defaults@example.edu")

        self.connection.execute(
            """
            INSERT INTO batch_tasks (
                identity_id,
                llm_profile_id,
                name,
                target_count,
                primary_material_id,
                selected_material_ids
            )
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (identity_id, llm_profile_id, "测试任务", 1, None, json.dumps([])),
        )
        batch_task_id = self.connection.execute(
            "SELECT id FROM batch_tasks",
        ).fetchone()[0]

        self.connection.execute(
            """
            INSERT INTO email_tasks (
                batch_task_id,
                identity_id,
                llm_profile_id,
                professor_id,
                primary_material_id,
                selected_material_ids
            )
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (batch_task_id, identity_id, llm_profile_id, professor_id, None, json.dumps([])),
        )
        email_task_id = self.connection.execute("SELECT id FROM email_tasks").fetchone()[0]

        self.connection.execute(
            """
            INSERT INTO email_logs (email_task_id, identity_id, llm_profile_id, professor_id, direction, content)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (email_task_id, identity_id, llm_profile_id, professor_id, "sent", "hello"),
        )

        status, retry_count, is_read, is_replied = self.connection.execute(
            """
            SELECT status, retry_count, is_read, is_replied
            FROM email_tasks
            WHERE id = ?
            """,
            (email_task_id,),
        ).fetchone()

        self.assertEqual(status, "discovered")
        self.assertEqual(retry_count, 0)
        self.assertEqual(is_read, 0)
        self.assertEqual(is_replied, 0)

    def test_legacy_resume_and_attachment_data_are_backfilled(self) -> None:
        legacy_dir = tempfile.TemporaryDirectory()
        try:
            legacy_db_path = Path(legacy_dir.name) / "legacy_schema.db"
            legacy_env = os.environ.copy()
            legacy_env["DATABASE_URL"] = f"sqlite+aiosqlite:///{legacy_db_path.as_posix()}"

            self._run_alembic(legacy_env, "upgrade", LEGACY_RUNTIME_REVISION)

            resume_path = Path(legacy_dir.name) / "legacy_resume.txt"
            attachment_path = Path(legacy_dir.name) / "legacy_attachment.txt"
            resume_path.write_text("Legacy resume text", encoding="utf-8")
            attachment_path.write_text("Legacy attachment text", encoding="utf-8")

            connection = sqlite3.connect(legacy_db_path)
            connection.execute("PRAGMA foreign_keys = ON")

            identity_id = connection.execute(
                """
                INSERT INTO identity_profiles (
                    name,
                    email_address,
                    smtp_host,
                    smtp_username,
                    smtp_password,
                    resume_file_path,
                    resume_text
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    "旧身份",
                    "legacy@example.com",
                    "smtp.example.com",
                    "legacy@example.com",
                    "secret",
                    resume_path.as_posix(),
                    "Legacy resume text",
                ),
            ).lastrowid
            llm_profile_id = connection.execute(
                """
                INSERT INTO llm_profiles (name, provider, api_key, model_name)
                VALUES (?, ?, ?, ?)
                """,
                ("默认模型", "openai", "sk-test-key", "gpt-4o-mini"),
            ).lastrowid
            professor_id = connection.execute(
                """
                INSERT INTO professors (name, email, research_direction, crawl_status)
                VALUES (?, ?, ?, ?)
                """,
                ("李老师", "legacy-prof@example.edu", "大模型", "discovered"),
            ).lastrowid
            attachment_id = connection.execute(
                """
                INSERT INTO attachment_assets (identity_id, file_name, file_path, mime_type)
                VALUES (?, ?, ?, ?)
                """,
                (
                    identity_id,
                    "legacy_attachment.txt",
                    attachment_path.as_posix(),
                    "text/plain",
                ),
            ).lastrowid
            batch_task_id = connection.execute(
                """
                INSERT INTO batch_tasks (
                    identity_id,
                    llm_profile_id,
                    name,
                    target_count,
                    selected_attachment_ids
                )
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    identity_id,
                    llm_profile_id,
                    "旧批次任务",
                    1,
                    json.dumps([attachment_id]),
                ),
            ).lastrowid
            connection.execute(
                """
                INSERT INTO email_tasks (
                    batch_task_id,
                    identity_id,
                    llm_profile_id,
                    professor_id,
                    selected_attachments
                )
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    batch_task_id,
                    identity_id,
                    llm_profile_id,
                    professor_id,
                    json.dumps([attachment_id]),
                ),
            )
            connection.commit()
            connection.close()

            self._run_alembic(legacy_env, "upgrade", "head")

            upgraded = sqlite3.connect(legacy_db_path)
            upgraded.execute("PRAGMA foreign_keys = ON")

            material_rows = upgraded.execute(
                """
                SELECT display_name, original_filename, material_type
                FROM identity_materials
                WHERE identity_id = ?
                ORDER BY id
                """,
                (identity_id,),
            ).fetchall()
            current_primary_material_id = upgraded.execute(
                "SELECT current_primary_material_id FROM identity_profiles WHERE id = ?",
                (identity_id,),
            ).fetchone()[0]
            batch_row = upgraded.execute(
                """
                SELECT primary_material_id, selected_material_ids
                FROM batch_tasks
                WHERE id = ?
                """,
                (batch_task_id,),
            ).fetchone()
            email_row = upgraded.execute(
                """
                SELECT primary_material_id, selected_material_ids
                FROM email_tasks
                WHERE batch_task_id = ?
                """,
                (batch_task_id,),
            ).fetchone()

            self.assertEqual(len(material_rows), 2)
            self.assertEqual({row[2] for row in material_rows}, {"resume", "other"})
            self.assertIsNotNone(current_primary_material_id)
            self.assertEqual(batch_row[0], current_primary_material_id)
            self.assertEqual(email_row[0], current_primary_material_id)
            self.assertEqual(len(self._load_json(batch_row[1])), 1)
            self.assertEqual(len(self._load_json(email_row[1])), 1)

            upgraded.close()
        finally:
            legacy_dir.cleanup()

    def _run_alembic(self, env: dict[str, str], *args: str) -> None:
        result = subprocess.run(
            [sys.executable, "-m", "alembic", *args],
            cwd=BACKEND_DIR,
            env=env,
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0:
            self.fail(
                "Alembic command failed.\n"
                f"command: {' '.join(args)}\n"
                f"stdout:\n{result.stdout}\n"
                f"stderr:\n{result.stderr}",
            )

    def _get_columns(self, table_name: str) -> set[str]:
        rows = self.connection.execute(f"PRAGMA table_info('{table_name}')").fetchall()
        return {row[1] for row in rows}

    @staticmethod
    def _load_json(raw_value: str | None) -> list[int]:
        if raw_value is None:
            return []
        if isinstance(raw_value, str):
            return json.loads(raw_value)
        return list(raw_value)

    def _insert_identity(self) -> int:
        cursor = self.connection.execute(
            """
            INSERT INTO identity_profiles (
                name,
                email_address,
                smtp_host,
                smtp_username,
                smtp_password
            )
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                "默认身份",
                "identity-default@example.com",
                "smtp.example.com",
                "identity-default@example.com",
                "secret",
            ),
        )
        return int(cursor.lastrowid)

    def _insert_llm_profile(self) -> int:
        cursor = self.connection.execute(
            """
            INSERT INTO llm_profiles (
                name,
                provider,
                api_key,
                model_name
            )
            VALUES (?, ?, ?, ?)
            """,
            (
                "默认模型",
                "openai",
                "sk-test-key",
                "gpt-4o-mini",
            ),
        )
        return int(cursor.lastrowid)

    def _insert_professor(self, email: str) -> int:
        cursor = self.connection.execute(
            """
            INSERT INTO professors (name, email, research_direction, crawl_status)
            VALUES (?, ?, ?, ?)
            """,
            ("王老师", email, "知识图谱与大模型", "discovered"),
        )
        return int(cursor.lastrowid)


if __name__ == "__main__":
    unittest.main()
