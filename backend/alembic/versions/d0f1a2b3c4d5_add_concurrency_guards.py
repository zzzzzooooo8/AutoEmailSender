"""add concurrency guards

Revision ID: d0f1a2b3c4d5
Revises: c6d7e8f9a012
Create Date: 2026-05-10 00:00:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "d0f1a2b3c4d5"
down_revision: Union[str, Sequence[str], None] = "c6d7e8f9a012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _deduplicate_email_logs() -> None:
    op.execute(
        """
        DELETE FROM email_logs
        WHERE rfc_message_id IS NOT NULL
          AND id NOT IN (
            SELECT MIN(id)
            FROM email_logs
            WHERE rfc_message_id IS NOT NULL
            GROUP BY rfc_message_id
          )
        """,
    )


def _deduplicate_workspace_root_tasks() -> None:
    bind = op.get_bind()
    duplicate_groups = list(
        bind.execute(
            sa.text(
                """
                SELECT professor_id, identity_id, llm_profile_id
                FROM email_tasks
                WHERE source = 'manual'
                  AND batch_task_id IS NULL
                  AND parent_task_id IS NULL
                GROUP BY professor_id, identity_id, llm_profile_id
                HAVING COUNT(*) > 1
                """,
            ),
        ).mappings(),
    )

    for group in duplicate_groups:
        ids = [
            int(row["id"])
            for row in bind.execute(
                sa.text(
                    """
                    SELECT id
                    FROM email_tasks
                    WHERE source = 'manual'
                      AND batch_task_id IS NULL
                      AND parent_task_id IS NULL
                      AND professor_id = :professor_id
                      AND identity_id = :identity_id
                      AND llm_profile_id = :llm_profile_id
                    ORDER BY id
                    """,
                ),
                {
                    "professor_id": group["professor_id"],
                    "identity_id": group["identity_id"],
                    "llm_profile_id": group["llm_profile_id"],
                },
            ).mappings()
        ]
        if len(ids) <= 1:
            continue

        keep_id = ids[-1]
        duplicate_ids = ids[:-1]
        params = {f"id_{index}": value for index, value in enumerate(duplicate_ids)}
        id_list = ", ".join(f":id_{index}" for index in range(len(duplicate_ids)))

        child_count = bind.scalar(
            sa.text(f"SELECT COUNT(*) FROM email_tasks WHERE parent_task_id IN ({id_list})"),
            params,
        )
        if child_count:
            raise RuntimeError(
                "无法自动清理重复工作区任务：存在已派生子任务的重复根任务。"
                f"professor_id={group['professor_id']}, "
                f"identity_id={group['identity_id']}, "
                f"llm_profile_id={group['llm_profile_id']}, "
                f"duplicate_task_ids={duplicate_ids}。"
                "请先在数据库中合并这些工作区任务，保留一个根任务并迁移或删除其子任务后重新运行迁移。"
            )

        bind.execute(
            sa.text(f"UPDATE email_logs SET email_task_id = :keep_id WHERE email_task_id IN ({id_list})"),
            {"keep_id": keep_id, **params},
        )
        bind.execute(
            sa.text(f"DELETE FROM email_tasks WHERE id IN ({id_list})"),
            params,
        )


def upgrade() -> None:
    _deduplicate_email_logs()
    _deduplicate_workspace_root_tasks()

    op.create_index(
        "uq_email_logs_rfc_message_id",
        "email_logs",
        ["rfc_message_id"],
        unique=True,
    )
    op.create_index(
        "uq_email_tasks_workspace_task",
        "email_tasks",
        ["professor_id", "identity_id", "llm_profile_id"],
        unique=True,
        sqlite_where=sa.text("source = 'manual' AND batch_task_id IS NULL AND parent_task_id IS NULL"),
        postgresql_where=sa.text("source = 'manual' AND batch_task_id IS NULL AND parent_task_id IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_email_tasks_workspace_task", table_name="email_tasks")
    op.drop_index("uq_email_logs_rfc_message_id", table_name="email_logs")
