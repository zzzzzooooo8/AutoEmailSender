from __future__ import annotations

from datetime import UTC, datetime, timedelta
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
    TokenUsageChartBucketRead,
    TokenUsageChartGranularity,
    TokenUsageChartPreset,
    TokenUsageChartRead,
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
    if (
        start_at is not None
        and end_at is not None
        and _to_utc_naive(start_at) > _to_utc_naive(end_at)
    ):
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


async def build_token_usage_chart(
    session: AsyncSession,
    *,
    feature_type: str = "all",
    preset: TokenUsageChartPreset = "last_24_hours",
    start_at: datetime | None = None,
    end_at: datetime | None = None,
    now: datetime | None = None,
) -> TokenUsageChartRead:
    range_start, range_end, granularity = _resolve_chart_range(
        preset=preset,
        start_at=start_at,
        end_at=end_at,
        now=now,
    )
    candidates = await _list_all_candidate_records(session)
    records = _filter_records(
        candidates,
        feature_type=feature_type,
        start_at=range_start,
        end_at=range_end + _bucket_duration(granularity) - timedelta(microseconds=1),
    )
    bucket_totals = _aggregate_chart_buckets(records, granularity=granularity)
    buckets = [
        TokenUsageChartBucketRead(
            bucket_start=bucket_start,
            bucket_label=_format_bucket_label(bucket_start, granularity),
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_tokens=input_tokens + output_tokens,
        )
        for bucket_start, input_tokens, output_tokens in _iter_chart_buckets(
            range_start,
            range_end,
            granularity=granularity,
            bucket_totals=bucket_totals,
        )
    ]
    return TokenUsageChartRead(
        preset=preset,
        granularity=granularity,
        range_start=range_start,
        range_end=range_end,
        buckets=buckets,
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


def _resolve_chart_range(
    *,
    preset: TokenUsageChartPreset,
    start_at: datetime | None,
    end_at: datetime | None,
    now: datetime | None,
) -> tuple[datetime, datetime, TokenUsageChartGranularity]:
    resolved_now = _as_utc_aware(now or datetime.now(UTC))
    if preset == "last_6_hours":
        range_end = _floor_hour(resolved_now)
        return range_end - timedelta(hours=5), range_end, "hour"
    if preset == "last_24_hours":
        range_end = _floor_hour(resolved_now)
        return range_end - timedelta(hours=23), range_end, "hour"
    if preset == "last_7_days":
        range_end = _floor_day(resolved_now)
        return range_end - timedelta(days=6), range_end, "day"

    if start_at is None or end_at is None:
        raise ValueError("自定义趋势图需要开始时间和结束时间")
    if _as_utc_aware(start_at) > _as_utc_aware(end_at):
        raise ValueError("开始时间不能晚于结束时间")

    range_start = _as_utc_aware(start_at)
    range_end = _as_utc_aware(end_at)
    if range_end - range_start <= timedelta(hours=48):
        return _floor_hour(range_start), _floor_hour(range_end), "hour"
    return _floor_day(range_start), _floor_day(range_end), "day"


def _aggregate_chart_buckets(
    records: list[TokenUsageRecordRead],
    *,
    granularity: TokenUsageChartGranularity,
) -> dict[datetime, tuple[int, int]]:
    buckets: dict[datetime, tuple[int, int]] = {}
    for record in records:
        bucket_start = _bucket_start(record.created_at, granularity)
        current_input, current_output = buckets.get(bucket_start, (0, 0))
        buckets[bucket_start] = (
            current_input + (record.input_tokens or 0),
            current_output + (record.output_tokens or 0),
        )
    return buckets


def _iter_chart_buckets(
    range_start: datetime,
    range_end: datetime,
    *,
    granularity: TokenUsageChartGranularity,
    bucket_totals: dict[datetime, tuple[int, int]],
) -> list[tuple[datetime, int, int]]:
    buckets: list[tuple[datetime, int, int]] = []
    current = range_start
    while current <= range_end:
        input_tokens, output_tokens = bucket_totals.get(current, (0, 0))
        buckets.append((current, input_tokens, output_tokens))
        current = _next_bucket(current, granularity)
    return buckets


def _bucket_start(
    value: datetime,
    granularity: TokenUsageChartGranularity,
) -> datetime:
    utc_value = _as_utc_aware(value)
    if granularity == "hour":
        return _floor_hour(utc_value)
    return _floor_day(utc_value)


def _next_bucket(
    value: datetime,
    granularity: TokenUsageChartGranularity,
) -> datetime:
    if granularity == "hour":
        return value + timedelta(hours=1)
    return value + timedelta(days=1)


def _bucket_duration(granularity: TokenUsageChartGranularity) -> timedelta:
    if granularity == "hour":
        return timedelta(hours=1)
    return timedelta(days=1)


def _format_bucket_label(
    value: datetime,
    granularity: TokenUsageChartGranularity,
) -> str:
    if granularity == "hour":
        return value.strftime("%H:00")
    return value.strftime("%m-%d")


def _floor_hour(value: datetime) -> datetime:
    return _as_utc_aware(value).replace(minute=0, second=0, microsecond=0)


def _floor_day(value: datetime) -> datetime:
    return _as_utc_aware(value).replace(hour=0, minute=0, second=0, microsecond=0)


def _as_utc_aware(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


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
