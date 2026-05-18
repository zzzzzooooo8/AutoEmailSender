from __future__ import annotations

import unittest
from email.message import EmailMessage

from app.services.imap_message_fetcher import (
    fetch_message_headers_by_uid,
    parse_text_parts_from_message,
    search_uids_from_sender,
    search_uids_since,
)


class ImapMessageFetcherTestCase(unittest.TestCase):
    def test_parse_text_parts_ignores_attachment_payload(self) -> None:
        message = EmailMessage()
        message["From"] = "prof@example.edu"
        message["To"] = "student@example.com"
        message["Subject"] = "Re: Hello"
        message["Message-ID"] = "<reply@example.edu>"
        message.set_content("plain body")
        message.add_alternative("<p>html body</p>", subtype="html")
        message.add_attachment(
            b"large attachment bytes",
            maintype="application",
            subtype="pdf",
            filename="cv.pdf",
        )

        parsed = parse_text_parts_from_message(message)

        self.assertEqual(parsed.body_text, "plain body\n")
        self.assertEqual(parsed.body_html, "<p>html body</p>\n")
        self.assertTrue(parsed.has_attachments)
        self.assertEqual(parsed.attachment_names, ["cv.pdf"])

    def test_fetch_headers_command_does_not_request_rfc822(self) -> None:
        client = FakeImapClient(search_payload=b"1")

        fetch_message_headers_by_uid(client, 1)

        serialized = " ".join(str(item) for item in client.commands)
        self.assertIn("HEADER.FIELDS", serialized)
        self.assertNotIn("RFC822", serialized)

    def test_search_incremental_uses_next_uid(self) -> None:
        client = FakeImapClient(search_payload=b"11 12")

        result = search_uids_since(client, 10)

        self.assertEqual(result, [11, 12])
        serialized = " ".join(str(item) for item in client.commands)
        self.assertIn("11:*", serialized)

    def test_search_from_sender_uses_professor_email(self) -> None:
        client = FakeImapClient(search_payload=b"5")

        result = search_uids_from_sender(client, "prof@example.edu")

        self.assertEqual(result, [5])
        serialized = " ".join(str(item) for item in client.commands)
        self.assertIn("FROM", serialized)
        self.assertIn("prof@example.edu", serialized)


class FakeImapClient:
    def __init__(self, *, search_payload: bytes) -> None:
        self.commands: list[tuple[str, tuple[object, ...]]] = []
        self.search_payload = search_payload

    def uid(self, command: str, *args: object):
        self.commands.append((command, args))
        if command == "SEARCH":
            return "OK", [self.search_payload]
        if command == "FETCH":
            return "OK", [
                (
                    b"1 (BODY[HEADER.FIELDS] {84}",
                    b"From: prof@example.edu\r\nMessage-ID: <reply@example.edu>\r\nSubject: Re: Hello\r\n\r\n",
                ),
            ]
        return "NO", []
