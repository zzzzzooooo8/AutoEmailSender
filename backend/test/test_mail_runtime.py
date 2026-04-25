from __future__ import annotations

import imaplib
import unittest
from unittest.mock import patch

from app.models import IdentityProfile
from app.services.mail_runtime import (
    MailRuntimeError,
    _fetch_recent_inbox_messages_sync,
    _test_imap_connection_sync,
    parse_received_email,
)


class _FakeImapClient:
    def __init__(self, select_status: str = "OK") -> None:
        self.select_status = select_status
        self.search_called = False
        self.commands: list[str] = []

    def login(self, username: str, password: str):
        self.commands.append("login")
        return "OK", [b"logged in"]

    def _simple_command(self, command: str, payload: str):
        self.commands.append(command)
        return "OK", [b"id accepted"]

    def _untagged_response(self, status: str, data, command: str):
        return status, data

    def select(self, mailbox: str):
        self.commands.append(f"select:{mailbox}")
        return self.select_status, [b"EXAMINE Unsafe Login. Please contact kefu@188.com for help"]

    def search(self, charset, criterion: str):
        self.search_called = True
        return "OK", [b""]

    def logout(self):
        return "OK", [b"logout"]


def _build_identity() -> IdentityProfile:
    return IdentityProfile(
        name="测试身份",
        profile_name="测试身份",
        sender_name="测试同学",
        email_address="sender@example.com",
        smtp_host="smtp.example.com",
        smtp_port=465,
        smtp_username="sender@example.com",
        smtp_password="secret",
        imap_host="imap.example.com",
        imap_port=993,
        imap_username="sender@example.com",
        imap_password="secret",
    )


class MailRuntimeTest(unittest.TestCase):
    def test_imap_connection_sends_client_id_before_selecting_inbox(self) -> None:
        client = _FakeImapClient(select_status="OK")
        previous_id_command = imaplib.Commands.pop("ID", None)
        self.addCleanup(
            lambda: imaplib.Commands.__setitem__("ID", previous_id_command)
            if previous_id_command is not None
            else imaplib.Commands.pop("ID", None),
        )

        with patch("app.services.mail_runtime._open_imap_client", return_value=client):
            _test_imap_connection_sync(_build_identity())

        self.assertEqual(client.commands[:3], ["login", "ID", "select:INBOX"])
        self.assertIn("ID", imaplib.Commands)

    def test_imap_connection_fails_when_inbox_select_is_rejected(self) -> None:
        client = _FakeImapClient(select_status="NO")

        with patch("app.services.mail_runtime._open_imap_client", return_value=client):
            with self.assertRaisesRegex(MailRuntimeError, "IMAP 选择收件箱失败"):
                _test_imap_connection_sync(_build_identity())

    def test_fetch_recent_messages_fails_before_search_when_inbox_select_is_rejected(self) -> None:
        client = _FakeImapClient(select_status="NO")

        with patch("app.services.mail_runtime._open_imap_client", return_value=client):
            with self.assertRaisesRegex(MailRuntimeError, "IMAP 选择收件箱失败"):
                _fetch_recent_inbox_messages_sync(_build_identity())

        self.assertFalse(client.search_called)

    def test_parse_received_email_strips_quoted_original_message_from_plain_text(self) -> None:
        raw_message = (
            "From: juniexd <juniexd@qq.com>\r\n"
            "To: juniexd <juniexd@163.com>\r\n"
            "Subject: =?utf-8?b?5Zue5aSNOltmYWtlXQ==?=\r\n"
            "Message-ID: <reply@example.com>\r\n"
            "In-Reply-To: <sent@example.com>\r\n"
            "Content-Type: text/plain; charset=utf-8\r\n"
            "\r\n"
            "欢迎报考\r\n"
            "---- 回复的原邮件 ----\r\n"
            "发件人 王俊杰<juniexd@163.com>\r\n"
            "尊敬的老师：这部分是原邮件正文\r\n"
        ).encode("utf-8")

        received = parse_received_email(raw_message)

        self.assertEqual(received.content, "欢迎报考")
        self.assertNotIn("回复的原邮件", received.content)
        self.assertNotIn("尊敬的老师", received.content)

    def test_parse_received_email_strips_quoted_original_message_from_html(self) -> None:
        raw_message = (
            "From: teacher@example.com\r\n"
            "To: sender@example.com\r\n"
            "Subject: Re: hello\r\n"
            "Message-ID: <reply-html@example.com>\r\n"
            "Content-Type: text/html; charset=utf-8\r\n"
            "\r\n"
            "<p>欢迎报考</p>"
            "<div>---- 回复的原邮件 ----</div>"
            "<p>尊敬的老师：这部分是原邮件正文</p>\r\n"
        ).encode("utf-8")

        received = parse_received_email(raw_message)

        self.assertIn("欢迎报考", received.content_html or "")
        self.assertNotIn("回复的原邮件", received.content_html or "")
        self.assertNotIn("尊敬的老师", received.content_html or "")


if __name__ == "__main__":
    unittest.main()
