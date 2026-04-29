from __future__ import annotations

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
    TokenUsageRecordListRead,
    TokenUsageRecordRead,
    TokenUsageSummaryRead,
)


async def list_token_usage_records(
    session: AsyncSession,
    *,
    limit: int = 20,
) -> TokenUsageRecordListRead:
    resolved_limit = min(max(limit, 1), 100)
    candidates: list[TokenUsageRecordRead] = []
    candidates.extend(await _list_crawl_records(session, limit=resolved_limit))
    candidates.extend(await _list_match_records(session, limit=resolved_limit))
    candidates.extend(await _list_draft_records(session, limit=resolved_limit))

    records = sorted(candidates, key=lambda item: item.created_at, reverse=True)[
        :resolved_limit
    ]
    return TokenUsageRecordListRead(
        records=records,
        summary=_build_summary(records),
    )


async def _list_crawl_records(
    session: AsyncSession,
    *,
    limit: int,
) -> list[TokenUsageRecordRead]:
    runs = list(
        await session.scalars(
            select(CrawlJobRun)
            .options(
                selectinload(CrawlJobRun.job).selectinload(CrawlJob.llm_profile),
            )
            .order_by(CrawlJobRun.created_at.desc())
            .limit(limit),
        ),
    )
    return [_crawl_run_to_record(run) for run in runs]


async def _list_match_records(
    session: AsyncSession,
    *,
    limit: int,
) -> list[TokenUsageRecordRead]:
    runs = list(
        await session.scalars(
            select(MatchAnalysisRun)
            .options(
                selectinload(MatchAnalysisRun.professor),
                selectinload(MatchAnalysisRun.identity),
                selectinload(MatchAnalysisRun.llm_profile),
            )
            .order_by(MatchAnalysisRun.created_at.desc())
            .limit(limit),
        ),
    )
    return [_match_run_to_record(run) for run in runs]


async def _list_draft_records(
    session: AsyncSession,
    *,
    limit: int,
) -> list[TokenUsageRecordRead]:
    logs = list(
        await session.scalars(
            select(EmailLog)
            .options(
                selectinload(EmailLog.professor),
                selectinload(EmailLog.identity),
                selectinload(EmailLog.llm_profile),
            )
            .where(EmailLog.direction == EmailDirection.DRAFT.value)
            .order_by(EmailLog.created_at.desc())
            .limit(limit * 3),
        ),
    )
    records = [
        record
        for log in logs
        for record in [_draft_log_to_record(log)]
        if record is not None
    ]
    return records[:limit]


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


def _build_summary(records: list[TokenUsageRecordRead]) -> TokenUsageSummaryRead:
    return TokenUsageSummaryRead(
        input_tokens=sum(item.input_tokens or 0 for item in records),
        output_tokens=sum(item.output_tokens or 0 for item in records),
        cached_tokens=sum(item.cached_tokens or 0 for item in records),
        total_tokens=sum(item.total_tokens or 0 for item in records),
        record_count=len(records),
    )
