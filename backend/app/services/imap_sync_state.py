from __future__ import annotations

from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models import (
    EmailLog,
    EmailTask,
    IdentityProfile,
    ImapProfessorSyncState,
    Professor,
)


async def ensure_professor_scan_states(
    session_factory: async_sessionmaker[AsyncSession],
) -> int:
    created = 0
    async with session_factory() as session:
        rows = await _load_contacted_professor_rows(session)
        for identity_id, professor_id, professor_email in rows:
            normalized_email = _normalize_email(professor_email)
            if not normalized_email:
                continue
            existing = await session.scalar(
                select(ImapProfessorSyncState).where(
                    ImapProfessorSyncState.identity_id == identity_id,
                    ImapProfessorSyncState.professor_id == professor_id,
                    ImapProfessorSyncState.professor_email == normalized_email,
                    ImapProfessorSyncState.folder == "INBOX",
                ),
            )
            if existing is not None:
                continue
            session.add(
                ImapProfessorSyncState(
                    identity_id=identity_id,
                    professor_id=professor_id,
                    professor_email=normalized_email,
                ),
            )
            created += 1
        await session.commit()
    return created


async def _load_contacted_professor_rows(
    session: AsyncSession,
) -> list[tuple[int, int, str | None]]:
    task_rows = (
        await session.execute(
            select(IdentityProfile.id, Professor.id, Professor.email)
            .join(EmailTask, EmailTask.identity_id == IdentityProfile.id)
            .join(Professor, Professor.id == EmailTask.professor_id)
            .where(
                IdentityProfile.imap_host.is_not(None),
                IdentityProfile.imap_username.is_not(None),
                IdentityProfile.imap_password.is_not(None),
                Professor.email.is_not(None),
            )
            .distinct(),
        )
    ).all()
    log_rows = (
        await session.execute(
            select(IdentityProfile.id, Professor.id, Professor.email)
            .join(EmailLog, EmailLog.identity_id == IdentityProfile.id)
            .join(Professor, Professor.id == EmailLog.professor_id)
            .where(
                IdentityProfile.imap_host.is_not(None),
                IdentityProfile.imap_username.is_not(None),
                IdentityProfile.imap_password.is_not(None),
                Professor.email.is_not(None),
            )
            .distinct(),
        )
    ).all()
    return _dedupe_rows([*task_rows, *log_rows])


def _dedupe_rows(
    rows: Iterable[tuple[int, int, str | None]],
) -> list[tuple[int, int, str | None]]:
    seen: set[tuple[int, int, str]] = set()
    deduped: list[tuple[int, int, str | None]] = []
    for identity_id, professor_id, professor_email in rows:
        normalized_email = _normalize_email(professor_email)
        if not normalized_email:
            continue
        key = (identity_id, professor_id, normalized_email)
        if key in seen:
            continue
        seen.add(key)
        deduped.append((identity_id, professor_id, normalized_email))
    return deduped


def _normalize_email(value: str | None) -> str:
    return (value or "").strip().lower()
