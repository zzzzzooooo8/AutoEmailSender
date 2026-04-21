from __future__ import annotations

import csv
import io
import re
from dataclasses import dataclass
from typing import Any

from openpyxl import Workbook, load_workbook

from app.schemas.professor import ProfessorUpsertPayload


PROFESSOR_TEMPLATE_COLUMNS = [
    "name",
    "email",
    "title",
    "university",
    "school",
    "department",
    "research_direction",
    "recent_papers",
    "profile_url",
    "source_url",
]

SUPPORTED_IMPORT_EXTENSIONS = {".csv", ".xlsx"}
EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


@dataclass(slots=True)
class ParsedProfessorImport:
    data: dict[str, Any]
    failed_count: int


def is_valid_professor_email(email: str) -> bool:
    return bool(EMAIL_PATTERN.match(email.strip()))


def normalize_professor_payload(payload: ProfessorUpsertPayload) -> dict[str, Any]:
    return {
        "name": payload.name.strip(),
        "email": payload.email.strip().lower(),
        "title": payload.title,
        "university": payload.university,
        "school": payload.school,
        "department": payload.department,
        "research_direction": payload.research_direction,
        "recent_papers": payload.recent_papers,
        "profile_url": payload.profile_url,
        "source_url": payload.source_url,
    }


def build_professor_template(format_name: str) -> tuple[bytes, str, str]:
    normalized = format_name.lower()
    if normalized == "csv":
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow(PROFESSOR_TEMPLATE_COLUMNS)
        content = buffer.getvalue().encode("utf-8-sig")
        return content, "text/csv; charset=utf-8", "professors_import_template.csv"

    if normalized == "xlsx":
        workbook = Workbook()
        sheet = workbook.active
        sheet.title = "Professors"
        sheet.append(PROFESSOR_TEMPLATE_COLUMNS)
        for index, column in enumerate(PROFESSOR_TEMPLATE_COLUMNS, start=1):
            sheet.cell(row=1, column=index).value = column
            sheet.column_dimensions[chr(64 + index)].width = 22

        buffer = io.BytesIO()
        workbook.save(buffer)
        return (
            buffer.getvalue(),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "professors_import_template.xlsx",
        )

    raise ValueError("仅支持 csv 或 xlsx 模板")


def parse_professor_import_file(filename: str, content: bytes) -> ParsedProfessorImport:
    suffix = _resolve_suffix(filename)
    if suffix == ".csv":
        rows = _parse_csv_rows(content)
    else:
        rows = _parse_xlsx_rows(content)

    deduplicated: dict[str, dict[str, Any]] = {}
    failed_count = 0
    for row in rows:
        normalized = _normalize_import_row(row)
        if normalized is None:
            failed_count += 1
            continue
        deduplicated[normalized["email"]] = normalized

    return ParsedProfessorImport(
        data=deduplicated,
        failed_count=failed_count,
    )


def _resolve_suffix(filename: str) -> str:
    lower_name = filename.lower()
    for suffix in SUPPORTED_IMPORT_EXTENSIONS:
        if lower_name.endswith(suffix):
            return suffix
    raise ValueError("仅支持导入 csv 或 xlsx 文件")


def _parse_csv_rows(content: bytes) -> list[dict[str, Any]]:
    try:
        decoded = content.decode("utf-8-sig")
    except UnicodeDecodeError as error:
        raise ValueError("CSV 文件请使用 UTF-8 编码") from error

    reader = csv.DictReader(io.StringIO(decoded))
    _validate_columns(reader.fieldnames)
    return [dict(row) for row in reader]


def _parse_xlsx_rows(content: bytes) -> list[dict[str, Any]]:
    workbook = load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    sheet = workbook.active
    row_iter = sheet.iter_rows(values_only=True)
    try:
        headers = next(row_iter)
    except StopIteration:
        raise ValueError("导入文件为空")

    header_names = [str(cell).strip() if cell is not None else "" for cell in headers]
    _validate_columns(header_names)

    rows: list[dict[str, Any]] = []
    for row in row_iter:
        rows.append(
            {
                header_names[index]: row[index] if index < len(row) else None
                for index in range(len(header_names))
            }
        )
    return rows


def _validate_columns(columns: list[str] | tuple[str, ...] | None) -> None:
    if columns is None:
        raise ValueError("导入文件缺少表头")

    normalized = [str(item).strip() for item in columns]
    missing = [column for column in PROFESSOR_TEMPLATE_COLUMNS if column not in normalized]
    if missing:
        raise ValueError(f"导入文件缺少必要列：{', '.join(missing)}")


def _normalize_import_row(row: dict[str, Any]) -> dict[str, Any] | None:
    raw_values = {key: _clean_cell_value(row.get(key)) for key in PROFESSOR_TEMPLATE_COLUMNS}
    if not any(raw_values.values()):
        return None

    name = raw_values["name"]
    email = (raw_values["email"] or "").lower()
    if not name or not email or not is_valid_professor_email(email):
        return None

    return {
        "name": name,
        "email": email,
        "title": raw_values["title"],
        "university": raw_values["university"],
        "school": raw_values["school"],
        "department": raw_values["department"],
        "research_direction": raw_values["research_direction"],
        "recent_papers": _parse_recent_papers(raw_values["recent_papers"]),
        "profile_url": raw_values["profile_url"],
        "source_url": raw_values["source_url"],
    }


def _clean_cell_value(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _parse_recent_papers(value: str | None) -> list[str]:
    if not value:
        return []
    return [item.strip() for item in value.split("|") if item.strip()]
