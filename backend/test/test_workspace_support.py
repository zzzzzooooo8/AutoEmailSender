from __future__ import annotations

import unittest
from datetime import UTC, datetime

from app.api.workspace_support import _serialize_workspace_message
from app.models import EmailDirection, EmailLog


class WorkspaceSupportTest(unittest.TestCase):
    def test_received_workspace_message_strips_quoted_original_message(self) -> None:
        message = _serialize_workspace_message(
            EmailLog(
                id=1,
                email_task_id=1,
                identity_id=1,
                llm_profile_id=1,
                professor_id=1,
                direction=EmailDirection.RECEIVED.value,
                subject="回复：[推免自荐] 王俊杰",
                content="欢迎报考\n---- 回复的原邮件 ----\n尊敬的老师：原邮件正文",
                content_html="<p>欢迎报考</p><div>---- 回复的原邮件 ----</div><p>原邮件正文</p>",
                created_at=datetime.now(UTC),
            ),
        )

        self.assertEqual(message.content, "欢迎报考")
        self.assertEqual(message.content_html, "<p>欢迎报考</p>")

    def test_sent_workspace_message_keeps_approved_body_unchanged(self) -> None:
        message = _serialize_workspace_message(
            EmailLog(
                id=1,
                email_task_id=1,
                identity_id=1,
                llm_profile_id=1,
                professor_id=1,
                direction=EmailDirection.SENT.value,
                subject="[推免自荐] 王俊杰",
                content="正文\n---- 回复的原邮件 ----\n这里是用户写入的内容",
                content_html=None,
                created_at=datetime.now(UTC),
            ),
        )

        self.assertIn("回复的原邮件", message.content)


if __name__ == "__main__":
    unittest.main()
