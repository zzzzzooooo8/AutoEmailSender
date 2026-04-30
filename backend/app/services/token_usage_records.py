from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    CrawlJob,
    CrawlJobRun,
    CrawlJobStatus,
    EmailDirection,
    EmailLog,
    MatchAnalysisRun,
)
from app.schemas.token_usage import (
    TokenUsagePaginationRead,
    TokenUsageRecordListRead,
    TokenUsageRecordRead,
    TokenUsageSummaryRead,
)


async def list_token_usage_records(
    session: AsyncSession,
    *,
    page: int = 1,
    page_size: int = 5,
    feature_type: str = "all",
    start_at: datetime | None = None,
    end_at: datetime | None = None,
) -> TokenUsageRecordListRead:
    if start_at is not None and end_at is not None and start_at > end_at:
        raise ValueError("开始时间不能晚于结束时间")

    resolved_page = max(page, 1)
    resolved_page_size = min(max(page_size, 1), 100)
    candidates = await _list_all_candidate_records(session)
    records = sorted(
        _filter_records(
            candidates,
            feature_type=feature_type,
            start_at=start_at,
            end_at=end_at,
        ),
        key=lambda item: item.created_at,
        reverse=True,
    )
    total_records = len(records)
    total_pages = (total_records + resolved_page_size - 1) // resolved_page_size
    start_index = (resolved_page - 1) * resolved_page_size
    page_records = records[start_index : start_index + resolved_page_size]

    return TokenUsageRecordListRead(
        records=page_records,
        summary=_build_summary(records),
        pagination=TokenUsagePaginationRead(
            page=resolved_page,
            page_size=resolved_page_size,
            total_records=total_records,
            total_pages=total_pages,
        ),
    )


async def _list_all_candidate_records(
    session: AsyncSession,
) -> list[TokenUsageRecordRead]:
    candidates: list[TokenUsageRecordRead] = []
    candidates.extend(await _list_crawl_records(session, limit=None))
    candidates.extend(await _list_match_records(session, limit=None))
    candidates.extend(await _list_draft_records(session, limit=None))
    return candidates


def _filter_records(
    records: list[TokenUsageRecordRead],
    *,
    feature_type: str,
    start_at: datetime | None,
    end_at: datetime | None,
) -> list[TokenUsageRecordRead]:
    filtered = records
    if feature_type != "all":
        filtered = [item for item in filtered if item.feature_type == feature_type]
    if start_at is not None:
        comparable_start = _to_utc_naive(start_at)
        filtered = [
            item
            for item in filtered
            if _to_utc_naive(item.created_at) >= comparable_start
        ]
    if end_at is not None:
        comparable_end = _to_utc_naive(end_at)
        filtered = [
            item for item in filtered if _to_utc_naive(item.created_at) <= comparable_end
        ]
    return filtered


async def _list_crawl_records(
    session: AsyncSession,
    *,
    limit: int | None,
) -> list[TokenUsageRecordRead]:
    statement = (
        select(CrawlJobRun)
        .options(
            selectinload(CrawlJobRun.job).selectinload(CrawlJob.llm_profile),
        )
        .order_by(CrawlJobRun.created_at.desc())
    )
    if limit is not None:
        statement = statement.limit(limit)
    runs = list(
        await session.scalars(
            statement,
        ),
    )
    return [_crawl_run_to_record(run) for run in runs]


async def _list_match_records(
    session: AsyncSession,
    *,
    limit: int | None,
) -> list[TokenUsageRecordRead]:
    statement = (
        select(MatchAnalysisRun)
        .options(
            selectinload(MatchAnalysisRun.professor),
            selectinload(MatchAnalysisRun.identity),
            selectinload(MatchAnalysisRun.llm_profile),
        )
        .order_by(MatchAnalysisRun.created_at.desc())
    )
    if limit is not None:
        statement = statement.limit(limit)
    runs = list(
        await session.scalars(
            statement,
        ),
    )
    return [_match_run_to_record(run) for run in runs]


async def _list_draft_records(
    session: AsyncSession,
    *,
    limit: int | None,
) -> list[TokenUsageRecordRead]:
    statement = (
        select(EmailLog)
        .options(
            selectinload(EmailLog.professor),
            selectinload(EmailLog.identity),
            selectinload(EmailLog.llm_profile),
        )
        .where(EmailLog.direction == EmailDirection.DRAFT.value)
        .order_by(EmailLog.created_at.desc())
    )
    if limit is not None:
        statement = statement.limit(limit * 3)
    logs = list(
        await session.scalars(
            statement,
        ),
    )
    records = [
        record
        for log in logs
        for record in [_draft_log_to_record(log)]
        if record is not None
    ]
    return records if limit is None else records[:limit]


def _crawl_run_to_record(run: CrawlJobRun) -> TokenUsageRecordRead:
    job = run.job
    title_context = None
    if job is not None:
        title_context = job.school or job.university or job.start_url
    return TokenUsageRecordRead(
        id=f"crawl:{run.id}",
        feature_type="crawl",
        feature_label="智能爬取",
        title=f"智能爬取 - {title_context or '未命名任务'}",
        input_tokens=run.input_tokens,
        output_tokens=run.output_tokens,
        cached_tokens=None,
        total_tokens=run.total_tokens,
        model_name=job.llm_profile.model_name if job and job.llm_profile else None,
        identity_name=None,
        created_at=run.created_at,
        status=_map_crawl_status(run.status),
    )


def _match_run_to_record(run: MatchAnalysisRun) -> TokenUsageRecordRead:
    professor_name = run.professor.name if run.professor else "未关联导师"
    return TokenUsageRecordRead(
        id=f"match_analysis:{run.id}",
        feature_type="match_analysis",
        feature_label="匹配分析",
        title=f"{professor_name} - 匹配分析",
        input_tokens=run.prompt_tokens,
        output_tokens=run.completion_tokens,
        cached_tokens=run.cached_tokens,
        total_tokens=run.total_tokens,
        model_name=run.llm_profile.model_name if run.llm_profile else None,
        identity_name=_identity_name(run.identity),
        created_at=run.created_at,
        status="success" if run.success else "failed",
    )


def _draft_log_to_record(log: EmailLog) -> TokenUsageRecordRead | None:
    usage = _extract_usage(log.provider_payload)
    if usage is None:
        return None
    professor_name = log.professor.name if log.professor else "未关联导师"
    return TokenUsageRecordRead(
        id=f"draft_generation:{log.id}",
        feature_type="draft_generation",
        feature_label="AI 草稿",
        title=f"{professor_name} - AI 草稿",
        input_tokens=usage.get("prompt_tokens"),
        output_tokens=usage.get("completion_tokens"),
        cached_tokens=None,
        total_tokens=usage.get("total_tokens"),
        model_name=log.llm_profile.model_name if log.llm_profile else None,
        identity_name=_identity_name(log.identity),
        created_at=log.created_at,
        status="success",
    )


def _extract_usage(payload: dict[str, object] | None) -> dict[str, int | None] | None:
    if not payload:
        return None
    raw_usage = payload.get("usage")
    if not isinstance(raw_usage, dict):
        return None
    return {
        "prompt_tokens": _int_or_none(raw_usage.get("prompt_tokens")),
        "completion_tokens": _int_or_none(raw_usage.get("completion_tokens")),
        "total_tokens": _int_or_none(raw_usage.get("total_tokens")),
    }


def _int_or_none(value: Any) -> int | None:
    return value if isinstance(value, int) else None


def _identity_name(identity: object) -> str | None:
    profile_name = getattr(identity, "profile_name", None)
    name = getattr(identity, "name", None)
    if isinstance(profile_name, str) and profile_name.strip():
        return profile_name
    return name if isinstance(name, str) and name.strip() else None


def _map_crawl_status(status: str) -> str:
    if status in {
        CrawlJobStatus.QUEUED.value,
        CrawlJobStatus.RUNNING.value,
        CrawlJobStatus.PAUSED.value,
    }:
        return "running"
    if status in {
        CrawlJobStatus.NEEDS_REVIEW.value,
        CrawlJobStatus.COMPLETED.value,
    }:
        return "success"
    if status in {
        CrawlJobStatus.FAILED.value,
        CrawlJobStatus.CANCELED.value,
    }:
        return "failed"
    return "unknown"


def _to_utc_naive(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value
    return value.astimezone(UTC).replace(tzinfo=None)


def _build_summary(records: list[TokenUsageRecordRead]) -> TokenUsageSummaryRead:
    return TokenUsageSummaryRead(
        input_tokens=sum(item.input_tokens or 0 for item in records),
        output_tokens=sum(item.output_tokens or 0 for item in records),
        cached_tokens=sum(item.cached_tokens or 0 for item in records),
        total_tokens=sum(item.total_tokens or 0 for item in records),
        record_count=len(records),
    )
