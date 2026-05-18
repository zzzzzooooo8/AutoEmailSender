from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from email.message import Message


@dataclass(slots=True)
class ParsedTextParts:
    body_text: str | None
    body_html: str | None
    has_attachments: bool
    attachment_names: list[str] = field(default_factory=list)


@dataclass(slots=True)
class ImapFetchedMessage:
    uid: int
    from_email: str
    subject: str | None
    message_id: str | None
    in_reply_to: str | None
    references: str | None
    sent_at: datetime
    received_at: datetime | None
    headers: dict[str, str]
    body_text: str
    body_html: str | None
    has_attachments: bool = False
    attachment_names: list[str] = field(default_factory=list)


def parse_text_parts_from_message(message: Message) -> ParsedTextParts:
    text_part: str | None = None
    html_part: str | None = None
    has_attachments = False
    attachment_names: list[str] = []

    for part in message.walk():
        if part.is_multipart():
            continue
        disposition = (part.get_content_disposition() or "").lower()
        filename = part.get_filename()
        content_type = part.get_content_type().lower()
        if disposition == "attachment" or filename:
            has_attachments = True
            if filename:
                attachment_names.append(filename)
            continue
        if content_type not in {"text/plain", "text/html"}:
            continue
        content = _get_part_content(part)
        if content_type == "text/plain" and text_part is None:
            text_part = content
        if content_type == "text/html" and html_part is None:
            html_part = content

    return ParsedTextParts(
        body_text=text_part,
        body_html=html_part,
        has_attachments=has_attachments,
        attachment_names=attachment_names,
    )


def fetch_message_headers_by_uid(client: object, uid: int) -> bytes:
    status, payload = client.uid(
        "FETCH",
        str(uid),
        "(BODY.PEEK[HEADER.FIELDS (MESSAGE-ID FROM TO CC SUBJECT DATE IN-REPLY-TO REFERENCES)] INTERNALDATE)",
    )
    if status != "OK" or not payload:
        return b""
    for item in payload:
        if isinstance(item, tuple) and len(item) >= 2 and isinstance(item[1], (bytes, bytearray)):
            return bytes(item[1])
    return b""


def search_uids_since(client: object, last_seen_uid: int | None) -> list[int]:
    start_uid = 1 if last_seen_uid is None else last_seen_uid + 1
    status, payload = client.uid("SEARCH", None, f"UID {start_uid}:*")
    if status != "OK" or not payload:
        return []
    raw = payload[0] if payload else b""
    return [int(item) for item in raw.split() if item.isdigit()]


def search_uids_from_sender(client: object, from_email: str) -> list[int]:
    escaped = from_email.replace('"', '\\"')
    status, payload = client.uid("SEARCH", None, f'(FROM "{escaped}")')
    if status != "OK" or not payload:
        return []
    raw = payload[0] if payload else b""
    return [int(item) for item in raw.split() if item.isdigit()]


def _get_part_content(part: Message) -> str:
    get_content = getattr(part, "get_content", None)
    if callable(get_content):
        try:
            return str(get_content())
        except Exception:
            pass
    payload = part.get_payload(decode=True) or b""
    charset = part.get_content_charset() or "utf-8"
    return payload.decode(charset, errors="replace")
