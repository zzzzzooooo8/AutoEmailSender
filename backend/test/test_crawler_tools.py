from __future__ import annotations

import asyncio
import socket
import types
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import httpx
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.models import CrawlCandidate, CrawlJob, CrawlJobStatus, CrawlPage
from app.models.base import Base
from app.services.crawler_tools import (
    CrawlToolContext,
    PageSnapshot,
    ProfessorCandidatePayload,
    crawl_page_with_crawl4ai,
    crawl_page_with_http,
    is_allowed_crawl_url,
    is_safe_public_crawl_url,
    normalize_candidate_payload,
    record_page_snapshot,
    save_candidates,
)
from app.services import crawler_tools


class CrawlerToolTests(unittest.TestCase):
    def test_is_allowed_crawl_url_allows_same_host(self) -> None:
        with patch(
            "app.services.crawler_tools.socket.getaddrinfo",
            return_value=[
                (0, 0, 0, "", ("93.184.216.34", 443)),
            ],
        ):
            self.assertTrue(
                is_allowed_crawl_url(
                    "https://cs.example.edu/faculty",
                    "https://cs.example.edu/people/a",
                )
            )

    def test_is_allowed_crawl_url_rejects_other_host(self) -> None:
        with patch(
            "app.services.crawler_tools.socket.getaddrinfo",
            return_value=[
                (0, 0, 0, "", ("93.184.216.34", 443)),
            ],
        ):
            self.assertFalse(
                is_allowed_crawl_url(
                    "https://cs.example.edu/faculty",
                    "https://evil.example.net/people/a",
                )
            )

    def test_is_safe_public_crawl_url_rejects_unsafe_ip_literals_and_localhost(self) -> None:
        for url in (
            "http://127.0.0.1/faculty",
            "http://localhost/faculty",
            "http://faculty.localhost/faculty",
            "http://10.0.0.1/faculty",
            "http://169.254.169.254/latest/meta-data",
            "http://224.0.0.1/faculty",
            "http://0.0.0.0/faculty",
            "http://192.0.2.1/faculty",
        ):
            with self.subTest(url=url):
                self.assertFalse(is_safe_public_crawl_url(url))

    def test_is_safe_public_crawl_url_allows_domain_resolving_to_public_ip(self) -> None:
        with patch(
            "app.services.crawler_tools.socket.getaddrinfo",
            return_value=[
                (0, 0, 0, "", ("93.184.216.34", 443)),
            ],
        ):
            self.assertTrue(is_safe_public_crawl_url("https://faculty.example.edu"))

    def test_is_safe_public_crawl_url_rejects_domain_resolving_to_private_ip(self) -> None:
        with patch(
            "app.services.crawler_tools.socket.getaddrinfo",
            return_value=[
                (0, 0, 0, "", ("93.184.216.34", 443)),
                (0, 0, 0, "", ("10.0.0.1", 443)),
            ],
        ):
            self.assertFalse(is_safe_public_crawl_url("https://faculty.example.edu"))

    def test_is_safe_public_crawl_url_rejects_unresolvable_domain(self) -> None:
        with patch(
            "app.services.crawler_tools.socket.getaddrinfo",
            side_effect=socket.gaierror,
        ):
            self.assertFalse(is_safe_public_crawl_url("https://faculty.example.edu"))

    def test_normalize_candidate_payload_fills_school_context(self) -> None:
        payload = normalize_candidate_payload(
            ProfessorCandidatePayload(
                name=" 张三 ",
                email=" zhang@example.edu ",
                title="教授",
                university=None,
                school=None,
                department=None,
                research_direction=" 信息检索 ",
                recent_papers=[" Paper A ", ""],
                profile_url="https://cs.example.edu/zhang",
                source_url="https://cs.example.edu/zhang",
                confidence=1.5,
                field_confidence={"email": 1.2},
                evidence={"name": "张三"},
            ),
            university="示例大学",
            school="计算机学院",
        )

        self.assertEqual(payload["name"], "张三")
        self.assertEqual(payload["email"], "zhang@example.edu")
        self.assertEqual(payload["university"], "示例大学")
        self.assertEqual(payload["school"], "计算机学院")
        self.assertEqual(payload["recent_papers"], ["Paper A"])
        self.assertEqual(payload["confidence"], 1.0)
        self.assertEqual(payload["field_confidence"], {"email": 1.0})


class CrawlerHttpToolTests(unittest.IsolatedAsyncioTestCase):
    async def test_save_candidates_skips_canceled_job(self) -> None:
        session_factory = _FakeSessionFactory(job_status="canceled")
        ctx = CrawlToolContext(
            job_id=1,
            start_url="https://cs.example.edu/faculty",
            university="示例大学",
            school="计算机学院",
            session_factory=session_factory,  # type: ignore[arg-type]
        )

        saved = await save_candidates(
            ctx,
            [
                ProfessorCandidatePayload(
                    name="张三",
                    email="zhang@example.edu",
                ),
            ],
        )

        self.assertEqual(saved, [])
        self.assertEqual(session_factory.added, [])

    async def test_save_candidates_rolls_back_when_job_is_canceled_before_commit(self) -> None:
        session_factory = _FakeSessionFactory(job_statuses=["running", "canceled"])
        ctx = CrawlToolContext(
            job_id=1,
            start_url="https://cs.example.edu/faculty",
            university="示例大学",
            school="计算机学院",
            session_factory=session_factory,  # type: ignore[arg-type]
        )

        saved = await save_candidates(
            ctx,
            [
                ProfessorCandidatePayload(
                    name="张三",
                    email="zhang@example.edu",
                ),
            ],
        )

        self.assertEqual(saved, [])
        self.assertEqual(session_factory.added, [])
        self.assertEqual(session_factory.rollback_count, 1)

    async def test_record_page_snapshot_skips_canceled_job(self) -> None:
        session_factory = _FakeSessionFactory(job_status="canceled")
        ctx = CrawlToolContext(
            job_id=1,
            start_url="https://cs.example.edu/faculty",
            university="示例大学",
            school="计算机学院",
            session_factory=session_factory,  # type: ignore[arg-type]
        )

        row = await record_page_snapshot(
            ctx,
            PageSnapshot(
                url="https://cs.example.edu/faculty",
                title="Faculty",
                text="Faculty page",
                fetch_method="http",
                status="succeeded",
            ),
        )

        self.assertIsNone(row)
        self.assertEqual(session_factory.added, [])

    async def test_record_page_snapshot_rolls_back_when_job_is_canceled_before_commit(self) -> None:
        session_factory = _FakeSessionFactory(job_statuses=["running", "canceled"])
        ctx = CrawlToolContext(
            job_id=1,
            start_url="https://cs.example.edu/faculty",
            university="示例大学",
            school="计算机学院",
            session_factory=session_factory,  # type: ignore[arg-type]
        )

        row = await record_page_snapshot(
            ctx,
            PageSnapshot(
                url="https://cs.example.edu/faculty",
                title="Faculty",
                text="Faculty page",
                fetch_method="http",
                status="succeeded",
            ),
        )

        self.assertIsNone(row)
        self.assertEqual(session_factory.added, [])
        self.assertEqual(session_factory.rollback_count, 1)

    async def test_save_candidates_sees_canceled_status_changed_by_other_session(self) -> None:
        async with _RealCrawlerSessionHarness() as harness:
            job_id = await harness.create_job()
            ctx = CrawlToolContext(
                job_id=job_id,
                start_url="https://cs.example.edu/faculty",
                university="示例大学",
                school="计算机学院",
                session_factory=harness.cancel_on_second_status_factory(job_id),  # type: ignore[arg-type]
            )

            saved = await save_candidates(
                ctx,
                [
                    ProfessorCandidatePayload(
                        name="张三",
                        email="zhang@example.edu",
                    ),
                ],
            )

            self.assertEqual(saved, [])
            self.assertEqual(await harness.count_rows(CrawlCandidate), 0)

    async def test_record_page_snapshot_sees_canceled_status_changed_by_other_session(self) -> None:
        async with _RealCrawlerSessionHarness() as harness:
            job_id = await harness.create_job()
            ctx = CrawlToolContext(
                job_id=job_id,
                start_url="https://cs.example.edu/faculty",
                university="示例大学",
                school="计算机学院",
                session_factory=harness.cancel_on_second_status_factory(job_id),  # type: ignore[arg-type]
            )

            row = await record_page_snapshot(
                ctx,
                PageSnapshot(
                    url="https://cs.example.edu/faculty",
                    title="Faculty",
                    text="Faculty page",
                    fetch_method="http",
                    status="succeeded",
                ),
            )

            self.assertIsNone(row)
            self.assertEqual(await harness.count_rows(CrawlPage), 0)

    async def test_crawl_page_with_http_rejects_cross_host_final_url(self) -> None:
        session_factory = _FakeSessionFactory()
        ctx = CrawlToolContext(
            job_id=1,
            start_url="https://cs.example.edu/faculty",
            university="示例大学",
            school="计算机学院",
            session_factory=session_factory,  # type: ignore[arg-type]
        )
        response = _FakeHttpResponse(
            url="https://evil.example.net/people/a",
            text="<html><body>外域正文</body></html>",
        )

        with patch(
            "app.services.crawler_tools.socket.getaddrinfo",
            return_value=[
                (0, 0, 0, "", ("93.184.216.34", 443)),
            ],
        ), patch("app.services.crawler_tools.httpx.AsyncClient") as client_class:
            client = client_class.return_value.__aenter__.return_value
            client.get.return_value = response

            snapshot = await crawl_page_with_http(ctx, "https://cs.example.edu/faculty")

        self.assertEqual(snapshot.status, "failed")
        self.assertIn("最终 URL 不在允许范围内", snapshot.error_message or "")
        self.assertNotIn("外域正文", snapshot.text)

        self.assertEqual(len(session_factory.added), 1)
        recorded = session_factory.added[0]
        self.assertEqual(recorded.status, "failed")
        self.assertIsNone(recorded.text_excerpt)

    async def test_crawl_page_with_http_rejects_unsafe_final_url(self) -> None:
        session_factory = _FakeSessionFactory()
        ctx = CrawlToolContext(
            job_id=1,
            start_url="https://faculty.example.edu/faculty",
            university="示例大学",
            school="计算机学院",
            session_factory=session_factory,  # type: ignore[arg-type]
        )
        response = _FakeHttpResponse(
            url="http://127.0.0.1/admin",
            text="<html><body>本机正文</body></html>",
        )

        with patch(
            "app.services.crawler_tools.socket.getaddrinfo",
            return_value=[
                (0, 0, 0, "", ("93.184.216.34", 443)),
            ],
        ), patch("app.services.crawler_tools.httpx.AsyncClient") as client_class:
            client = client_class.return_value.__aenter__.return_value
            client.get.return_value = response

            snapshot = await crawl_page_with_http(ctx, "https://faculty.example.edu/faculty")

        self.assertEqual(snapshot.status, "failed")
        self.assertIn("URL 不允许指向本机、内网或不可解析地址", snapshot.error_message or "")
        self.assertNotIn("本机正文", snapshot.text)

    async def test_crawl_page_with_http_rejects_redirect_to_private_host(self) -> None:
        session_factory = _FakeSessionFactory()
        ctx = CrawlToolContext(
            job_id=1,
            start_url="https://faculty.example.edu/faculty",
            university="示例大学",
            school="计算机学院",
            session_factory=session_factory,  # type: ignore[arg-type]
        )
        response = _FakeHttpResponse(
            url="https://faculty.example.edu/private",
            text="<html><body>内网正文</body></html>",
        )
        public_dns = [(0, 0, 0, "", ("93.184.216.34", 443))]
        private_dns = [(0, 0, 0, "", ("10.0.0.1", 443))]

        with patch(
            "app.services.crawler_tools.socket.getaddrinfo",
            side_effect=[public_dns, public_dns, public_dns, public_dns, private_dns],
        ), patch("app.services.crawler_tools.httpx.AsyncClient") as client_class:
            client = client_class.return_value.__aenter__.return_value
            client.get.return_value = response

            snapshot = await crawl_page_with_http(ctx, "https://faculty.example.edu/faculty")

        self.assertEqual(snapshot.status, "failed")
        self.assertIn("URL 不允许指向本机、内网或不可解析地址", snapshot.error_message or "")
        self.assertNotIn("内网正文", snapshot.text)

    async def test_crawl_page_with_http_does_not_request_unsafe_redirect_target(self) -> None:
        session_factory = _FakeSessionFactory()
        ctx = CrawlToolContext(
            job_id=1,
            start_url="https://faculty.example.edu/faculty",
            university="示例大学",
            school="计算机学院",
            session_factory=session_factory,  # type: ignore[arg-type]
        )
        requested_urls: list[str] = []

        def handler(request: httpx.Request) -> httpx.Response:
            requested_urls.append(str(request.url))
            if str(request.url) == "https://faculty.example.edu/faculty":
                return httpx.Response(
                    302,
                    headers={"Location": "http://127.0.0.1/admin"},
                    request=request,
                )
            return httpx.Response(200, text="unsafe target was requested", request=request)

        transport = httpx.MockTransport(handler)
        async_client = httpx.AsyncClient

        def client_factory(**kwargs: object) -> httpx.AsyncClient:
            kwargs.pop("transport", None)
            return async_client(transport=transport, **kwargs)

        with patch(
            "app.services.crawler_tools.socket.getaddrinfo",
            return_value=[
                (0, 0, 0, "", ("93.184.216.34", 443)),
            ],
        ), patch("app.services.crawler_tools.httpx.AsyncClient", side_effect=client_factory):
            snapshot = await crawl_page_with_http(ctx, "https://faculty.example.edu/faculty")

        self.assertEqual(snapshot.status, "failed")
        self.assertIn("URL 不允许指向本机、内网或不可解析地址", snapshot.error_message or "")
        self.assertEqual(requested_urls, ["https://faculty.example.edu/faculty"])

    async def test_crawl_page_with_http_uses_validated_transport_without_env_proxy(self) -> None:
        session_factory = _FakeSessionFactory()
        ctx = CrawlToolContext(
            job_id=1,
            start_url="https://faculty.example.edu/faculty",
            university="示例大学",
            school="计算机学院",
            session_factory=session_factory,  # type: ignore[arg-type]
        )
        client_kwargs: list[dict[str, object]] = []
        response = _FakeHttpResponse(
            url="https://faculty.example.edu/faculty",
            text="<html><body>Faculty page</body></html>",
        )

        def client_factory(**kwargs: object) -> "_FakeAsyncHttpClient":
            client_kwargs.append(kwargs)
            return _FakeAsyncHttpClient(response)

        with patch(
            "app.services.crawler_tools.socket.getaddrinfo",
            return_value=[
                (0, 0, 0, "", ("93.184.216.34", 443)),
            ],
        ), patch("app.services.crawler_tools.httpx.AsyncClient", side_effect=client_factory):
            snapshot = await crawl_page_with_http(ctx, "https://faculty.example.edu/faculty")

        self.assertEqual(snapshot.status, "succeeded")
        self.assertGreaterEqual(len(client_kwargs), 1)
        for kwargs in client_kwargs:
            self.assertIs(kwargs.get("trust_env"), False)
            self.assertIn("transport", kwargs)

    async def test_crawl_page_with_http_connects_to_validated_ip_not_rebound_hostname(
        self,
    ) -> None:
        session_factory = _FakeSessionFactory()
        ctx = CrawlToolContext(
            job_id=1,
            start_url="https://faculty.example.edu/faculty",
            university="示例大学",
            school="计算机学院",
            session_factory=session_factory,  # type: ignore[arg-type]
        )
        backend = _RecordingNetworkBackend(
            response_bytes=(
                b"HTTP/1.1 200 OK\r\n"
                b"Content-Type: text/html; charset=utf-8\r\n"
                b"Content-Length: 38\r\n"
                b"\r\n"
                b"<html><body>Faculty page</body></html>"
            )
        )

        with patch(
            "app.services.crawler_tools.socket.getaddrinfo",
            return_value=[
                (0, 0, 0, "", ("93.184.216.34", 443)),
            ],
        ), patch(
            "app.services.crawler_tools._default_async_network_backend",
            return_value=backend,
        ):
            snapshot = await crawl_page_with_http(ctx, "https://faculty.example.edu/faculty")

        self.assertEqual(snapshot.status, "succeeded")
        self.assertEqual(backend.connect_calls, [("93.184.216.34", 443)])
        self.assertNotIn(("faculty.example.edu", 443), backend.connect_calls)
        self.assertEqual(backend.streams[0].tls_server_hostnames, ["faculty.example.edu"])

    async def test_crawl_page_with_http_re_resolves_and_rebinds_each_redirect_hop(
        self,
    ) -> None:
        session_factory = _FakeSessionFactory()
        ctx = CrawlToolContext(
            job_id=1,
            start_url="https://faculty.example.edu/faculty",
            university="示例大学",
            school="计算机学院",
            session_factory=session_factory,  # type: ignore[arg-type]
        )
        backend = _RecordingNetworkBackend(
            response_bytes=[
                b"HTTP/1.1 302 Found\r\n"
                b"Location: /people\r\n"
                b"Content-Length: 0\r\n"
                b"\r\n",
                b"HTTP/1.1 200 OK\r\n"
                b"Content-Type: text/html; charset=utf-8\r\n"
                b"Content-Length: 38\r\n"
                b"\r\n"
                b"<html><body>Faculty page</body></html>",
            ]
        )

        def resolve_current_public_ip(
            *args: object,
            **kwargs: object,
        ) -> list[tuple[int, int, int, str, tuple[str, int]]]:
            _ = args, kwargs
            if len(backend.connect_calls) == 0:
                return [(0, 0, 0, "", ("93.184.216.34", 443))]
            return [(0, 0, 0, "", ("93.184.216.35", 443))]

        with patch(
            "app.services.crawler_tools.socket.getaddrinfo",
            side_effect=resolve_current_public_ip,
        ), patch(
            "app.services.crawler_tools._default_async_network_backend",
            return_value=backend,
        ):
            snapshot = await crawl_page_with_http(ctx, "https://faculty.example.edu/faculty")

        self.assertEqual(snapshot.status, "succeeded")
        self.assertEqual(
            backend.connect_calls,
            [("93.184.216.34", 443), ("93.184.216.35", 443)],
        )

    async def test_safe_crawl_transport_connects_to_validated_ip_and_preserves_https_host_semantics(
        self,
    ) -> None:
        backend = _RecordingNetworkBackend(
            response_bytes=b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nOK"
        )
        transport = crawler_tools._build_safe_crawl_transport(
            hostname="faculty.example.edu",
            resolved_ip="93.184.216.34",
            network_backend=backend,
        )

        async with httpx.AsyncClient(transport=transport, trust_env=False) as client:
            response = await client.get("https://faculty.example.edu/faculty")

        self.assertEqual(response.text, "OK")
        self.assertEqual(backend.connect_calls, [("93.184.216.34", 443)])
        self.assertEqual(backend.streams[0].tls_server_hostnames, ["faculty.example.edu"])
        request_bytes = b"".join(backend.streams[0].writes)
        self.assertIn(b"GET /faculty HTTP/1.1", request_bytes)
        self.assertIn(b"Host: faculty.example.edu", request_bytes)

    async def test_crawl_page_with_crawl4ai_delegates_to_safe_http_path(self) -> None:
        session_factory = _FakeSessionFactory()
        ctx = CrawlToolContext(
            job_id=1,
            start_url="https://faculty.example.edu/faculty",
            university="示例大学",
            school="计算机学院",
            session_factory=session_factory,  # type: ignore[arg-type]
        )
        direct_calls: list[str] = []
        expected_snapshot = PageSnapshot(
            url="https://faculty.example.edu/faculty",
            text="Faculty page",
            fetch_method="http",
            status="succeeded",
        )

        class _UnsafeCrawler:
            async def __aenter__(self) -> "_UnsafeCrawler":
                return self

            async def __aexit__(self, *args: object) -> None:
                return None

            async def arun(self, *, url: str) -> object:
                direct_calls.append(url)
                return types.SimpleNamespace(success=True, url=url, html="<html></html>")

        async def safe_http_path(
            delegated_ctx: CrawlToolContext,
            delegated_url: str,
        ) -> PageSnapshot:
            self.assertIs(delegated_ctx, ctx)
            self.assertEqual(delegated_url, "https://faculty.example.edu/faculty")
            return expected_snapshot

        crawl4ai_module = types.SimpleNamespace(AsyncWebCrawler=_UnsafeCrawler)
        with patch(
            "app.services.crawler_tools.socket.getaddrinfo",
            return_value=[
                (0, 0, 0, "", ("93.184.216.34", 443)),
            ],
        ), patch.dict("sys.modules", {"crawl4ai": crawl4ai_module}), patch(
            "app.services.crawler_tools.crawl_page_with_http",
            side_effect=safe_http_path,
        ) as http_path:
            snapshot = await crawl_page_with_crawl4ai(ctx, "https://faculty.example.edu/faculty")

        self.assertIs(snapshot, expected_snapshot)
        self.assertEqual(http_path.call_count, 1)
        self.assertEqual(direct_calls, [])


class _FakeSessionFactory:
    def __init__(self, *, job_status: str = "running", job_statuses: list[str] | None = None) -> None:
        self.added: list[object] = []
        self._job_statuses = list(job_statuses or [job_status])
        self.rollback_count = 0

    def __call__(self) -> "_FakeSession":
        return _FakeSession(self)

    def next_job_status(self) -> str:
        if len(self._job_statuses) > 1:
            return self._job_statuses.pop(0)
        return self._job_statuses[0]


class _FakeSession:
    def __init__(self, factory: _FakeSessionFactory) -> None:
        self._factory = factory
        self._staged: list[object] = []

    async def __aenter__(self) -> "_FakeSession":
        return self

    async def __aexit__(self, *args: object) -> None:
        return None

    def add(self, row: object) -> None:
        self._staged.append(row)

    async def get(self, model: object, key: object) -> object:
        _ = model, key
        return _FakeJob(status=self._factory.next_job_status())

    async def scalar(self, statement: object) -> str:
        _ = statement
        return self._factory.next_job_status()

    async def scalars(self, statement: object) -> "_FakeScalarResult":
        _ = statement
        return _FakeScalarResult([])

    async def commit(self) -> None:
        self._factory.added.extend(self._staged)
        self._staged.clear()
        return None

    async def rollback(self) -> None:
        self._staged.clear()
        self._factory.rollback_count += 1

    async def refresh(self, row: object) -> None:
        return None


class _FakeScalarResult:
    def __init__(self, items: list[object]) -> None:
        self._items = items

    def __iter__(self):
        return iter(self._items)


class _FakeJob:
    def __init__(self, *, status: str) -> None:
        self.status = status


class _RealCrawlerSessionHarness:
    def __init__(self) -> None:
        self._temp_dir: tempfile.TemporaryDirectory[str] | None = None
        self._session_factory: async_sessionmaker[AsyncSession] | None = None
        self._engine = None

    async def __aenter__(self) -> "_RealCrawlerSessionHarness":
        asyncio.get_running_loop().slow_callback_duration = 1.0
        self._temp_dir = tempfile.TemporaryDirectory()
        db_path = Path(self._temp_dir.name) / "crawler_tools.db"
        self._engine = create_async_engine(f"sqlite+aiosqlite:///{db_path.as_posix()}")
        self._session_factory = async_sessionmaker(
            bind=self._engine,
            autoflush=False,
            expire_on_commit=False,
        )
        async with self._engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        return self

    async def __aexit__(self, *args: object) -> None:
        if self._engine is not None:
            await self._engine.dispose()
        if self._temp_dir is not None:
            self._temp_dir.cleanup()

    async def create_job(self) -> int:
        async with self._session_factory() as session:
            job = CrawlJob(
                university="示例大学",
                school="计算机学院",
                start_url="https://cs.example.edu/faculty",
                status=CrawlJobStatus.RUNNING.value,
                progress_current=0,
                progress_total=0,
            )
            session.add(job)
            await session.commit()
            await session.refresh(job)
            return job.id

    def cancel_on_second_status_factory(self, job_id: int) -> "_CancelOnSecondStatusSessionFactory":
        return _CancelOnSecondStatusSessionFactory(self._session_factory, job_id)

    async def count_rows(self, model: object) -> int:
        async with self._session_factory() as session:
            rows = await session.scalars(model.__table__.select())
            return len(list(rows))


class _CancelOnSecondStatusSessionFactory:
    def __init__(self, session_factory: async_sessionmaker[AsyncSession], job_id: int) -> None:
        self._session_factory = session_factory
        self._job_id = job_id

    def __call__(self) -> "_CancelOnSecondStatusSession":
        return _CancelOnSecondStatusSession(self._session_factory, self._job_id)


class _CancelOnSecondStatusSession:
    def __init__(self, session_factory: async_sessionmaker[AsyncSession], job_id: int) -> None:
        self._session_factory = session_factory
        self._job_id = job_id
        self._session: AsyncSession | None = None
        self._status_read_count = 0
        self._cached_job: CrawlJob | None = None

    async def __aenter__(self) -> "_CancelOnSecondStatusSession":
        self._session = self._session_factory()
        await self._session.__aenter__()
        self._cached_job = await self._session.get(CrawlJob, self._job_id)
        return self

    async def __aexit__(self, *args: object) -> None:
        await self._session.__aexit__(*args)

    def add(self, row: object) -> None:
        self._session.add(row)

    async def get(self, model: object, key: object) -> object:
        if model is CrawlJob and key == self._job_id:
            await self._maybe_cancel_job()
        return await self._session.get(model, key)

    async def scalar(self, statement: object) -> object:
        await self._maybe_cancel_job()
        return await self._session.scalar(statement)

    async def scalars(self, statement: object) -> object:
        return await self._session.scalars(statement)

    async def commit(self) -> None:
        await self._session.commit()

    async def rollback(self) -> None:
        await self._session.rollback()

    async def refresh(self, row: object) -> None:
        await self._session.refresh(row)

    async def _maybe_cancel_job(self) -> None:
        self._status_read_count += 1
        if self._status_read_count != 2:
            return
        async with self._session_factory() as session:
            job = await session.get(CrawlJob, self._job_id)
            job.status = CrawlJobStatus.CANCELED.value
            await session.commit()


class _FakeHttpResponse:
    def __init__(
        self,
        *,
        url: str,
        text: str,
        status_code: int = 200,
        headers: dict[str, str] | None = None,
    ) -> None:
        self.url = url
        self.text = text
        self.status_code = status_code
        self.headers = headers or {}

    @property
    def is_redirect(self) -> bool:
        return 300 <= self.status_code < 400 and "location" in {
            key.lower() for key in self.headers
        }

    def raise_for_status(self) -> None:
        return None


class _FakeAsyncHttpClient:
    def __init__(self, response: _FakeHttpResponse) -> None:
        self._response = response

    async def __aenter__(self) -> "_FakeAsyncHttpClient":
        return self

    async def __aexit__(self, *args: object) -> None:
        return None

    async def get(self, url: str, *, headers: dict[str, str]) -> _FakeHttpResponse:
        _ = url, headers
        return self._response


class _RecordingNetworkBackend:
    def __init__(self, *, response_bytes: bytes | list[bytes]) -> None:
        self.connect_calls: list[tuple[str, int]] = []
        responses = response_bytes if isinstance(response_bytes, list) else [response_bytes]
        self.streams = [_RecordingNetworkStream(response) for response in responses]
        self._next_stream_index = 0

    async def connect_tcp(
        self,
        host: str,
        port: int,
        timeout: float | None = None,
        local_address: str | None = None,
        socket_options: object | None = None,
    ) -> "_RecordingNetworkStream":
        _ = timeout, local_address, socket_options
        self.connect_calls.append((host, port))
        stream = self.streams[self._next_stream_index]
        if self._next_stream_index < len(self.streams) - 1:
            self._next_stream_index += 1
        return stream

    async def connect_unix_socket(
        self,
        path: str,
        timeout: float | None = None,
        socket_options: object | None = None,
    ) -> "_RecordingNetworkStream":
        _ = path, timeout, socket_options
        raise AssertionError("crawl transport must not use Unix sockets")

    async def sleep(self, seconds: float) -> None:
        _ = seconds
        return None


class _RecordingNetworkStream:
    def __init__(self, response_bytes: bytes) -> None:
        self._response_bytes = response_bytes
        self._read_offset = 0
        self.writes: list[bytes] = []
        self.tls_server_hostnames: list[str | None] = []

    async def read(self, max_bytes: int, timeout: float | None = None) -> bytes:
        _ = timeout
        if self._read_offset >= len(self._response_bytes):
            return b""
        chunk = self._response_bytes[self._read_offset : self._read_offset + max_bytes]
        self._read_offset += len(chunk)
        return chunk

    async def write(self, buffer: bytes, timeout: float | None = None) -> None:
        _ = timeout
        self.writes.append(buffer)

    async def aclose(self) -> None:
        return None

    async def start_tls(
        self,
        ssl_context: object,
        server_hostname: str | None = None,
        timeout: float | None = None,
    ) -> "_RecordingNetworkStream":
        _ = ssl_context, timeout
        self.tls_server_hostnames.append(server_hostname)
        return self

    def get_extra_info(self, info: str) -> object | None:
        _ = info
        return None


if __name__ == "__main__":
    unittest.main()
