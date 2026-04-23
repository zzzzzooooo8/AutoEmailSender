from __future__ import annotations

import asyncio
import mimetypes
import smtplib
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from email import policy
from email.header import decode_header, make_header
from email.message import EmailMessage
from email.parser import BytesParser
from email.utils import formataddr, make_msgid, parseaddr, parsedate_to_datetime
from html import escape
from imaplib import IMAP4, IMAP4_SSL
from pathlib import Path
from socket import timeout as SocketTimeout
from typing import Any

from app.core.config import get_settings
from app.models import IdentityProfile, Professor


class MailRuntimeError(RuntimeError):
    pass


@dataclass(slots=True)
class SendMailResult:
    message_id: str
    provider_payload: dict[str, Any]


@dataclass(slots=True)
class MailAttachment:
    file_path: str
    download_name: str


@dataclass(slots=True)
class ReceivedEmail:
    from_email: str
    subject: str | None
    content: str
    content_html: str | None
    message_id: str | None
    in_reply_to: str | None
    references: str | None
    sent_at: datetime
    headers: dict[str, str]


async def test_smtp_connection(identity: IdentityProfile) -> tuple[bool, str]:
    try:
        await asyncio.to_thread(_test_smtp_connection_sync, identity)
    except MailRuntimeError as exc:
        return False, str(exc)
    return True, "SMTP 连接测试成功"


async def test_imap_connection(identity: IdentityProfile) -> tuple[bool, str]:
    if not identity.imap_host or not identity.imap_username or not identity.imap_password:
        return False, "当前身份未完整配置 IMAP"
    try:
        await asyncio.to_thread(_test_imap_connection_sync, identity)
    except MailRuntimeError as exc:
        return False, str(exc)
    return True, "IMAP 连接测试成功"


async def send_email(
    *,
    identity: IdentityProfile,
    professor: Professor,
    subject: str,
    body_text: str,
    body_html: str | None,
    attachments: list[MailAttachment],
) -> SendMailResult:
    if not professor.email:
        raise MailRuntimeError("导师没有可用邮箱，无法发送")

    message = build_email_message(
        identity=identity,
        professor=professor,
        subject=subject,
        body_text=body_text,
        body_html=body_html,
        attachments=attachments,
    )
    await asyncio.to_thread(_send_email_sync, identity, message)
    return SendMailResult(
        message_id=message["Message-ID"],
        provider_payload={
            "smtp_host": identity.smtp_host,
            "smtp_port": identity.smtp_port,
            "to": professor.email,
        },
    )


async def send_email_to_recipient(
    *,
    identity: IdentityProfile,
    recipient_name: str,
    recipient_email: str,
    subject: str,
    body_text: str,
    body_html: str | None,
    attachments: list[MailAttachment],
) -> SendMailResult:
    recipient = Professor(
        name=recipient_name or recipient_email,
        email=recipient_email,
    )
    message = build_email_message(
        identity=identity,
        professor=recipient,
        subject=subject,
        body_text=body_text,
        body_html=body_html,
        attachments=attachments,
    )
    await asyncio.to_thread(_send_email_sync, identity, message)
    return SendMailResult(
        message_id=message["Message-ID"],
        provider_payload={
            "smtp_host": identity.smtp_host,
            "smtp_port": identity.smtp_port,
            "to": recipient_email,
        },
    )


async def fetch_recent_inbox_messages(identity: IdentityProfile) -> list[ReceivedEmail]:
    if not identity.imap_host or not identity.imap_username or not identity.imap_password:
        return []
    return await asyncio.to_thread(_fetch_recent_inbox_messages_sync, identity)


def build_email_message(
    *,
    identity: IdentityProfile,
    professor: Professor,
    subject: str,
    body_text: str,
    body_html: str | None,
    attachments: list[MailAttachment],
) -> EmailMessage:
    message = EmailMessage()
    message["From"] = formataddr((identity.name, identity.email_address))
    message["To"] = professor.email or ""
    message["Subject"] = subject
    message["Message-ID"] = make_msgid(domain=identity.email_address.split("@")[-1])
    message["Date"] = email_datetime_now()
    message.set_content(body_text)
    message.add_alternative(body_html or text_to_html(body_text), subtype="html")

    for attachment in attachments:
        path = Path(attachment.file_path)
        if not path.exists() or not path.is_file():
            continue
        mime_type, _ = mimetypes.guess_type(attachment.download_name)
        maintype, subtype = (mime_type or "application/octet-stream").split("/", 1)
        message.add_attachment(
            path.read_bytes(),
            maintype=maintype,
            subtype=subtype,
            filename=attachment.download_name,
        )

    return message


def text_to_html(body_text: str) -> str:
    paragraphs = [segment.strip() for segment in body_text.split("\n\n") if segment.strip()]
    if not paragraphs:
        return "<p></p>"
    return "".join(f"<p>{escape(paragraph).replace(chr(10), '<br/>')}</p>" for paragraph in paragraphs)


def email_datetime_now() -> str:
    return datetime.now(UTC).astimezone().strftime("%a, %d %b %Y %H:%M:%S %z")


def _test_smtp_connection_sync(identity: IdentityProfile) -> None:
    server = None
    try:
        server = _open_smtp_client(identity)
        server.login(identity.smtp_username, identity.smtp_password)
    except (OSError, smtplib.SMTPException, SocketTimeout) as exc:
        raise MailRuntimeError(f"SMTP 连接失败: {exc}") from exc
    finally:
        if server is not None:
            try:
                server.quit()
            except OSError:
                pass


def _test_imap_connection_sync(identity: IdentityProfile) -> None:
    client: IMAP4 | IMAP4_SSL | None = None
    try:
        client = _open_imap_client(identity)
        client.login(identity.imap_username or "", identity.imap_password or "")
        client.select("INBOX")
    except OSError as exc:
        raise MailRuntimeError(f"IMAP 连接失败: {exc}") from exc
    finally:
        if client is not None:
            try:
                client.logout()
            except OSError:
                pass


def _send_email_sync(identity: IdentityProfile, message: EmailMessage) -> None:
    server = None
    try:
        server = _open_smtp_client(identity)
        server.login(identity.smtp_username, identity.smtp_password)
        server.send_message(message)
    except (OSError, smtplib.SMTPException, SocketTimeout) as exc:
        raise MailRuntimeError(f"SMTP 发信失败: {exc}") from exc
    finally:
        if server is not None:
            try:
                server.quit()
            except OSError:
                pass


def _fetch_recent_inbox_messages_sync(identity: IdentityProfile) -> list[ReceivedEmail]:
    client: IMAP4 | IMAP4_SSL | None = None
    messages: list[ReceivedEmail] = []
    try:
        client = _open_imap_client(identity)
        client.login(identity.imap_username or "", identity.imap_password or "")
        client.select("INBOX")

        since_date = (datetime.now(UTC) - timedelta(hours=get_settings().imap_lookback_hours)).strftime(
            "%d-%b-%Y",
        )
        status, data = client.search(None, f'(SINCE "{since_date}")')
        if status != "OK":
            raise MailRuntimeError("IMAP 搜索失败")

        for message_id in data[0].split():
            fetch_status, payload = client.fetch(message_id, "(RFC822)")
            if fetch_status != "OK" or not payload or payload[0] is None:
                continue
            raw_message = payload[0][1]
            if not isinstance(raw_message, (bytes, bytearray)):
                continue
            messages.append(parse_received_email(bytes(raw_message)))
    except MailRuntimeError:
        raise
    except OSError as exc:
        raise MailRuntimeError(f"IMAP 拉取失败: {exc}") from exc
    finally:
        if client is not None:
            try:
                client.logout()
            except OSError:
                pass
    return messages


def parse_received_email(raw_message: bytes) -> ReceivedEmail:
    parsed = BytesParser(policy=policy.default).parsebytes(raw_message)
    subject = decode_mime_header(parsed.get("Subject"))
    from_email = parseaddr(parsed.get("From", ""))[1].strip().lower()
    message_id = parsed.get("Message-ID")
    in_reply_to = parsed.get("In-Reply-To")
    references = parsed.get("References")

    sent_at = datetime.now(UTC)
    if parsed.get("Date"):
        try:
            parsed_at = parsedate_to_datetime(parsed.get("Date"))
            sent_at = parsed_at.astimezone(UTC) if parsed_at.tzinfo else parsed_at.replace(tzinfo=UTC)
        except (TypeError, ValueError, IndexError):
            pass

    body_text, body_html = extract_message_content(parsed)
    headers = {
        "from": parsed.get("From", ""),
        "to": parsed.get("To", ""),
        "subject": subject or "",
        "message_id": message_id or "",
        "in_reply_to": in_reply_to or "",
        "references": references or "",
    }
    return ReceivedEmail(
        from_email=from_email,
        subject=subject,
        content=body_text,
        content_html=body_html,
        message_id=message_id,
        in_reply_to=in_reply_to,
        references=references,
        sent_at=sent_at,
        headers=headers,
    )


def extract_message_content(message: EmailMessage) -> tuple[str, str | None]:
    text_parts: list[str] = []
    html_parts: list[str] = []

    if message.is_multipart():
        for part in message.walk():
            if part.get_content_maintype() == "multipart":
                continue
            disposition = part.get_content_disposition()
            if disposition == "attachment":
                continue
            content_type = part.get_content_type()
            payload = part.get_content()
            if content_type == "text/plain":
                text_parts.append(str(payload))
            elif content_type == "text/html":
                html_parts.append(str(payload))
    else:
        payload = message.get_content()
        if message.get_content_type() == "text/html":
            html_parts.append(str(payload))
        else:
            text_parts.append(str(payload))

    text_content = "\n".join(part.strip() for part in text_parts if part.strip()).strip()
    html_content = "\n".join(part.strip() for part in html_parts if part.strip()).strip() or None
    if not text_content and html_content:
        text_content = html_content
    return text_content or "", html_content


def decode_mime_header(value: str | None) -> str | None:
    if not value:
        return None
    try:
        return str(make_header(decode_header(value)))
    except (LookupError, ValueError):
        return value


def _open_smtp_client(identity: IdentityProfile) -> smtplib.SMTP:
    timeout = get_settings().smtp_send_timeout_seconds
    if identity.smtp_port == 465:
        return smtplib.SMTP_SSL(identity.smtp_host, identity.smtp_port, timeout=timeout)

    server = smtplib.SMTP(identity.smtp_host, identity.smtp_port, timeout=timeout)
    server.ehlo()
    server.starttls()
    server.ehlo()
    return server


def _open_imap_client(identity: IdentityProfile) -> IMAP4 | IMAP4_SSL:
    timeout = get_settings().smtp_send_timeout_seconds
    if identity.imap_port == 993:
        return IMAP4_SSL(identity.imap_host or "", identity.imap_port or 993, timeout=timeout)
    return IMAP4(identity.imap_host or "", identity.imap_port or 143, timeout=timeout)
