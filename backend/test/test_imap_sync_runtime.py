from __future__ import annotations

import asyncio
import unittest

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.models import (
    Base,
    EmailDirection,
    EmailLog,
    EmailTask,
    IdentityProfile,
    ImapProfessorSyncState,
    LLMProfile,
    Professor,
)
from app.services.imap_sync_state import ensure_professor_scan_states


class ImapSyncRuntimeTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        self.session_factory = async_sessionmaker(self.engine, expire_on_commit=False)
        self._run_async(self._create_schema())

    def tearDown(self) -> None:
        self._run_async(self.engine.dispose())

    def _run_async(self, awaitable):
        return asyncio.run(awaitable)

    async def _create_schema(self) -> None:
        async with self.engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)

    def test_ensure_professor_scan_states_only_tracks_contacted_professors(self) -> None:
        async def scenario() -> list[str]:
            async with self.session_factory() as session:
                identity = self._build_identity()
                llm = self._build_llm()
                contacted = Professor(name="Contacted", email="contacted@example.edu")
                untouched = Professor(name="Untouched", email="untouched@example.edu")
                session.add_all([identity, llm, contacted, untouched])
                await session.flush()
                session.add(
                    EmailTask(
                        identity_id=identity.id,
                        llm_profile_id=llm.id,
                        professor_id=contacted.id,
                    ),
                )
                await session.commit()

            await ensure_professor_scan_states(self.session_factory)

            async with self.session_factory() as session:
                rows = list((await session.execute(select(ImapProfessorSyncState))).scalars())
                return [row.professor_email for row in rows]

        self.assertEqual(self._run_async(scenario()), ["contacted@example.edu"])

    def test_ensure_professor_scan_states_tracks_email_log_professors(self) -> None:
        async def scenario() -> list[str]:
            async with self.session_factory() as session:
                identity = self._build_identity()
                llm = self._build_llm()
                professor = Professor(name="Logged", email="logged@example.edu")
                session.add_all([identity, llm, professor])
                await session.flush()
                session.add(
                    EmailLog(
                        identity_id=identity.id,
                        llm_profile_id=llm.id,
                        professor_id=professor.id,
                        direction=EmailDirection.SENT.value,
                        subject="Hello",
                        content="Hi",
                    ),
                )
                await session.commit()

            await ensure_professor_scan_states(self.session_factory)

            async with self.session_factory() as session:
                rows = list((await session.execute(select(ImapProfessorSyncState))).scalars())
                return [row.professor_email for row in rows]

        self.assertEqual(self._run_async(scenario()), ["logged@example.edu"])

    @staticmethod
    def _build_identity() -> IdentityProfile:
        return IdentityProfile(
            name="测试身份",
            profile_name="测试身份",
            sender_name="王同学",
            email_address="student@example.com",
            smtp_host="smtp.example.com",
            smtp_port=465,
            smtp_username="student@example.com",
            smtp_password="secret",
            imap_host="imap.example.com",
            imap_port=993,
            imap_username="student@example.com",
            imap_password="secret",
        )

    @staticmethod
    def _build_llm() -> LLMProfile:
        return LLMProfile(
            name="默认模型",
            provider="openai",
            api_key="key",
            model_name="gpt-test",
        )
