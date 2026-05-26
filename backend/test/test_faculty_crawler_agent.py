from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

from app.agents.faculty_crawler_agent import (
    CONTROLLED_CRAWLER_TOOL_NAMES,
    FACULTY_CRAWLER_SYSTEM_PROMPT,
    SaveHistoryCompactionMiddleware,
    build_faculty_crawler_model,
    build_trace_event,
    compact_completed_chunk_history,
    compact_save_tool_history,
    run_faculty_crawler_agent,
    _format_chunked_crawl_page_response,
    _format_save_batch_result_for_model,
    _validate_professor_candidate_batch,
)
from app.models import LLMProfile
from app.services.crawler_tools import CrawlToolContext
from app.services.crawler_tools import PageSnapshot


class FacultyCrawlerAgentSaveResultTests(unittest.TestCase):
    def test_format_save_batch_result_for_model_is_compact(self) -> None:
        result = _format_save_batch_result_for_model(
            {
                "batch_status": "saved",
                "attempted_count": 10,
                "saved_count": 10,
                "merged_count": 0,
                "skipped_duplicate_count": 0,
                "rejected_count": 0,
                "failed_count": 0,
                "failed_items": [],
                "rejected_items": [],
                "total_saved_count": 50,
            }
        )

        self.assertEqual(
            result,
            {
                "batch_status": "saved",
                "attempted_count": 10,
                "saved_count": 10,
                "merged_count": 0,
                "skipped_duplicate_count": 0,
                "rejected_count": 0,
                "failed_count": 0,
                "failed_items": [],
                "rejected_items": [],
                "total_saved_count": 50,
            },
        )
        self.assertNotIn("name", str(result))
        self.assertNotIn("profile_url", str(result))

    def test_format_save_batch_result_for_model_includes_budget_metadata_when_present(self) -> None:
        result = _format_save_batch_result_for_model(
            {
                "batch_status": "rejected",
                "attempted_count": 1,
                "saved_count": 0,
                "failed_count": 1,
                "failed_items": [{"index": 0, "name": "张三", "reason": "name: Field required"}],
                "total_saved_count": 0,
                "retry_allowed": True,
                "failure_fingerprint": "abc123def456",
                "consecutive_same_batch_failures": 1,
                "total_save_failures": 1,
                "terminal_reason": None,
            }
        )

        self.assertEqual(result["retry_allowed"], True)
        self.assertEqual(result["failure_fingerprint"], "abc123def456")
        self.assertEqual(result["consecutive_same_batch_failures"], 1)
        self.assertEqual(result["total_save_failures"], 1)
        self.assertIsNone(result["terminal_reason"])


    def test_format_save_batch_result_for_model_includes_duplicate_feedback(self) -> None:
        result = _format_save_batch_result_for_model(
            {
                "batch_status": "duplicate_loop",
                "attempted_count": 10,
                "saved_count": 0,
                "merged_count": 0,
                "skipped_duplicate_count": 10,
                "rejected_count": 0,
                "failed_count": 0,
                "failed_items": [],
                "rejected_items": [],
                "total_saved_count": 20,
                "next_instruction": "连续多个批次均为重复候选，请停止保存当前内容，获取下一个 chunk 或结束任务。",
            }
        )

        self.assertEqual(result["merged_count"], 0)
        self.assertEqual(result["skipped_duplicate_count"], 10)
        self.assertEqual(result["rejected_count"], 0)
        self.assertIn("获取下一个 chunk", result["next_instruction"])

    def test_validate_professor_candidate_batch_collects_schema_failures(self) -> None:
        payloads, failed_items = _validate_professor_candidate_batch(
            [
                {
                    "name": "张三",
                    "recent_papers": "",
                    "field_confidence": 0.8,
                    "evidence": "页面",
                },
                {
                    "recent_papers": [],
                },
            ]
        )

        self.assertEqual([payload.name for payload in payloads], ["张三"])
        self.assertEqual(payloads[0].recent_papers, [])
        self.assertEqual(payloads[0].field_confidence, {"overall": 0.8})
        self.assertEqual(payloads[0].evidence, {"summary": "页面"})
        self.assertEqual(len(failed_items), 1)
        self.assertEqual(failed_items[0]["index"], 1)
        self.assertIsNone(failed_items[0]["name"])
        self.assertIn("name", failed_items[0]["reason"])


class FacultyCrawlerAgentCompactionTests(unittest.TestCase):
    def test_system_prompt_requires_structured_numeric_constraints(self) -> None:
        self.assertIn("每个候选对象都必须使用英文键", FACULTY_CRAWLER_SYSTEM_PROMPT)
        self.assertIn("字段值尽量保持页面原文", FACULTY_CRAWLER_SYSTEM_PROMPT)
        self.assertIn("不要翻译、音译或拼音化", FACULTY_CRAWLER_SYSTEM_PROMPT)
        self.assertIn("confidence 必须是 0 到 1 的数字", FACULTY_CRAWLER_SYSTEM_PROMPT)
        self.assertIn("evidence 保持简短", FACULTY_CRAWLER_SYSTEM_PROMPT)

    def test_system_prompt_makes_chunk_save_path_mandatory(self) -> None:
        self.assertIn("页面正文中的候选必须通过 submit_page_chunk_candidates 提交", FACULTY_CRAWLER_SYSTEM_PROMPT)
        self.assertIn("不要尝试使用其他保存入口", FACULTY_CRAWLER_SYSTEM_PROMPT)
        self.assertIn("返回 status=chunked", FACULTY_CRAWLER_SYSTEM_PROMPT)
        self.assertIn("必须立即调用 claim_next_page_chunk", FACULTY_CRAWLER_SYSTEM_PROMPT)

    def test_system_prompt_requires_finishing_current_chunk_before_new_page(self) -> None:
        self.assertIn("领取 chunk 后必须先完成当前 chunk", FACULTY_CRAWLER_SYSTEM_PROMPT)
        self.assertIn("发现新的候选列表页、分页或详情页链接时，先记住该 URL", FACULTY_CRAWLER_SYSTEM_PROMPT)
        self.assertIn("当前 chunk 完成后再调用 crawl_page", FACULTY_CRAWLER_SYSTEM_PROMPT)
        self.assertIn("不要在同一轮同时调用 submit_page_chunk_candidates 和 crawl_page", FACULTY_CRAWLER_SYSTEM_PROMPT)
        self.assertIn("has_unsubmitted_candidates_in_current_chunk", FACULTY_CRAWLER_SYSTEM_PROMPT)
        self.assertIn("刚好提交 10 个候选不代表需要拆分", FACULTY_CRAWLER_SYSTEM_PROMPT)
        self.assertIn("investigate_with_browser 不能用于绕过 chunk", FACULTY_CRAWLER_SYSTEM_PROMPT)
        self.assertIn("当前存在待处理 chunk 时，必须先 claim_next_page_chunk", FACULTY_CRAWLER_SYSTEM_PROMPT)
        self.assertIn("只有当前 chunk 正文中明确还有超过 10 个已看见候选", FACULTY_CRAWLER_SYSTEM_PROMPT)

    def test_compact_save_tool_history_keeps_saved_candidate_identities(self) -> None:
        messages = [
            HumanMessage(content="入口任务"),
            AIMessage(
                content="",
                tool_calls=[
                    {
                        "name": "submit_page_chunk_candidates",
                        "args": {
                            "candidates": [
                                {
                                    "name": "张三",
                                    "profile_url": "https://example.edu/zhang",
                                },
                                {"name": "李四"},
                            ]
                        },
                        "id": "call_1",
                    }
                ],
            ),
            ToolMessage(
                content='{"batch_status":"saved","attempted_count":2,"saved_count":2,"failed_count":0,"failed_items":[],"total_saved_count":2}',
                tool_call_id="call_1",
            ),
            AIMessage(
                content="",
                tool_calls=[
                    {
                        "name": "submit_page_chunk_candidates",
                        "args": {"candidates": [{"name": "王五"}]},
                        "id": "call_2",
                    }
                ],
            ),
            ToolMessage(
                content='{"batch_status":"saved","attempted_count":1,"saved_count":1,"failed_count":0,"failed_items":[],"total_saved_count":3}',
                tool_call_id="call_2",
            ),
        ]

        compacted = compact_save_tool_history(messages)
        serialized = "\n".join(str(message.content) for message in compacted)

        self.assertEqual(len(compacted), 2)
        self.assertIsInstance(compacted[0], HumanMessage)
        self.assertIsInstance(compacted[1], HumanMessage)
        self.assertIn("3", serialized)
        self.assertIn("张三 (https://example.edu/zhang)", serialized)
        self.assertIn("李四", serialized)
        self.assertIn("王五", serialized)

    def test_compact_save_tool_history_keeps_rejected_batch_failures(self) -> None:
        messages = [
            HumanMessage(content="入口任务"),
            AIMessage(
                content="",
                tool_calls=[
                    {
                        "name": "submit_page_chunk_candidates",
                        "args": {"candidates": [{"name": ""}]},
                        "id": "call_bad",
                    }
                ],
            ),
            ToolMessage(
                content='{"batch_status":"rejected","attempted_count":1,"saved_count":0,"failed_count":1,"failed_items":[{"index":0,"name":null,"reason":"name 不能为空"}],"total_saved_count":20}',
                tool_call_id="call_bad",
            ),
        ]

        compacted = compact_save_tool_history(messages)
        serialized = "\n".join(str(message.content) for message in compacted)

        self.assertIn("20", serialized)
        self.assertIn("index=0", serialized)
        self.assertIn("name 不能为空", serialized)

    def test_compaction_does_not_leave_orphan_save_tool_messages(self) -> None:
        messages = [
            HumanMessage(content="入口任务"),
            AIMessage(
                content="",
                tool_calls=[
                    {
                        "name": "submit_page_chunk_candidates",
                        "args": {"candidates": [{"name": "张三"}]},
                        "id": "call_1",
                    }
                ],
            ),
            ToolMessage(
                content='{"batch_status":"saved","attempted_count":1,"saved_count":1,"failed_count":0,"failed_items":[],"total_saved_count":1}',
                tool_call_id="call_1",
            ),
            AIMessage(
                content="",
                tool_calls=[
                    {
                        "name": "crawl_page",
                        "args": {"url": "https://example.edu"},
                        "id": "crawl_1",
                    }
                ],
            ),
            ToolMessage(
                content='{"status":"succeeded","text":"页面内容"}',
                tool_call_id="crawl_1",
            ),
        ]

        compacted = compact_save_tool_history(messages)
        tool_ids = {
            getattr(message, "tool_call_id", None)
            for message in compacted
            if getattr(message, "tool_call_id", None)
        }
        ai_tool_ids = {
            tool_call["id"]
            for message in compacted
            for tool_call in (getattr(message, "tool_calls", []) or [])
            if isinstance(tool_call, dict) and "id" in tool_call
        }

        self.assertNotIn("call_1", tool_ids)
        self.assertNotIn("call_1", ai_tool_ids)
        self.assertIn("crawl_1", tool_ids)
        self.assertIn("crawl_1", ai_tool_ids)

    def test_compact_completed_chunk_history_summarizes_old_completed_chunks(self) -> None:
        messages = [
            HumanMessage(content="入口任务"),
            AIMessage(
                content="领取第一页片段",
                tool_calls=[{"name": "claim_next_page_chunk", "args": {}, "id": "claim_1"}],
            ),
            ToolMessage(
                content='{"status":"ok","chunk_id":"chunk-1","source_url":"https://example.edu/list","chunk_index":0,"content":"很长的第一页片段正文 张三 李四"}',
                tool_call_id="claim_1",
            ),
            AIMessage(
                content="提交第一页片段",
                tool_calls=[
                    {
                        "name": "submit_page_chunk_candidates",
                        "args": {
                            "chunk_id": "chunk-1",
                            "candidates": [
                                {"name": "张三", "email": "zhang@example.edu"},
                                {"name": "李四", "profile_url": "https://example.edu/li"},
                            ],
                        },
                        "id": "submit_1",
                    }
                ],
            ),
            ToolMessage(
                content='{"batch_status":"saved","attempted_count":2,"saved_count":2,"merged_count":0,"rejected_count":0,"failed_count":0,"total_saved_count":2,"chunk_status":"completed"}',
                tool_call_id="submit_1",
            ),
            AIMessage(
                content="领取第二页片段",
                tool_calls=[{"name": "claim_next_page_chunk", "args": {}, "id": "claim_2"}],
            ),
            ToolMessage(
                content='{"status":"ok","chunk_id":"chunk-2","source_url":"https://example.edu/list?page=2","chunk_index":0,"content":"当前片段正文 王五"}',
                tool_call_id="claim_2",
            ),
            AIMessage(
                content="提交第二页片段",
                tool_calls=[
                    {
                        "name": "submit_page_chunk_candidates",
                        "args": {
                            "chunk_id": "chunk-2",
                            "candidates": [{"name": "王五"}],
                        },
                        "id": "submit_2",
                    }
                ],
            ),
            ToolMessage(
                content='{"batch_status":"saved","attempted_count":1,"saved_count":1,"merged_count":0,"rejected_count":0,"failed_count":0,"total_saved_count":3,"chunk_status":"completed"}',
                tool_call_id="submit_2",
            ),
        ]

        compacted = compact_completed_chunk_history(messages, keep_recent_completed_chunks=1)
        serialized = "\n".join(str(message.content) for message in compacted)
        tool_ids = {
            getattr(message, "tool_call_id", None)
            for message in compacted
            if getattr(message, "tool_call_id", None)
        }
        ai_tool_ids = {
            tool_call["id"]
            for message in compacted
            for tool_call in (getattr(message, "tool_calls", []) or [])
            if isinstance(tool_call, dict) and "id" in tool_call
        }

        self.assertIn("已完成页面片段历史已压缩", serialized)
        self.assertIn("chunk-1", serialized)
        self.assertIn("张三 (zhang@example.edu)", serialized)
        self.assertIn("李四 (https://example.edu/li)", serialized)
        self.assertNotIn("很长的第一页片段正文", serialized)
        self.assertIn("当前片段正文 王五", serialized)
        self.assertNotIn("claim_1", tool_ids)
        self.assertNotIn("submit_1", tool_ids)
        self.assertNotIn("claim_1", ai_tool_ids)
        self.assertNotIn("submit_1", ai_tool_ids)
        self.assertIn("claim_2", tool_ids)
        self.assertIn("submit_2", tool_ids)
        self.assertIn("claim_2", ai_tool_ids)
        self.assertIn("submit_2", ai_tool_ids)


class FacultyCrawlerAgentMiddlewareTests(unittest.TestCase):
    def test_chunked_crawl_page_response_omits_full_page_text(self) -> None:
        snapshot = PageSnapshot(
            page_id=123,
            url="https://cs.example.edu/faculty",
            title="师资队伍",
            text="张三\n李四" * 100,
            html="<main>大量页面正文</main>",
            links=["https://cs.example.edu/zhang"],
            fetch_method="http",
            status="succeeded",
        )

        result = _format_chunked_crawl_page_response(snapshot, created_chunks=2)

        self.assertEqual(result["status"], "chunked")
        self.assertEqual(result["created_chunks"], 2)
        self.assertNotIn("text", result)
        self.assertNotIn("html", result)
        self.assertIn("claim_next_page_chunk", result["message"])

    def test_build_trace_event_truncates_large_chunk_content(self) -> None:
        event = {"data": {"tools": {"messages": [{"content": "x" * 2000}]}}}
        trace = build_trace_event(event)
        self.assertNotIn("x" * 1500, str(trace))
        self.assertIn("chunk 内容已截断", str(trace))

    def test_controlled_tool_names_include_chunk_tools(self) -> None:
        self.assertIn("claim_next_page_chunk", CONTROLLED_CRAWLER_TOOL_NAMES)
        self.assertIn("submit_page_chunk_candidates", CONTROLLED_CRAWLER_TOOL_NAMES)

    def test_save_history_compaction_middleware_overrides_messages(self) -> None:
        original_messages = [
            HumanMessage(content="入口任务"),
            AIMessage(
                content="",
                tool_calls=[
                    {
                        "name": "submit_page_chunk_candidates",
                        "args": {"candidates": [{"name": "张三"}]},
                        "id": "call_1",
                    }
                ],
            ),
            ToolMessage(
                content='{"batch_status":"saved","attempted_count":1,"saved_count":1,"failed_count":0,"failed_items":[],"total_saved_count":1}',
                tool_call_id="call_1",
            ),
        ]
        captured: dict[str, object] = {}

        class Request:
            messages = original_messages
            tools: list[object] = []

            def override(self, **kwargs: object) -> object:
                captured.update(kwargs)
                return SimpleNamespace(
                    messages=kwargs.get("messages", self.messages),
                    tools=self.tools,
                )

        def handler(request: object) -> object:
            return request.messages

        result = SaveHistoryCompactionMiddleware().wrap_model_call(Request(), handler)

        self.assertEqual(result, captured["messages"])
        assert isinstance(result, list)
        self.assertEqual(len(result), 2)
        self.assertIn("1", result[1].content)

    def test_save_history_compaction_middleware_compacts_completed_chunks(self) -> None:
        original_messages = [
            HumanMessage(content="入口任务"),
            AIMessage(
                content="",
                tool_calls=[{"name": "claim_next_page_chunk", "args": {}, "id": "claim_1"}],
            ),
            ToolMessage(
                content='{"status":"ok","chunk_id":"chunk-1","source_url":"https://example.edu/list","chunk_index":0,"content":"旧片段正文"}',
                tool_call_id="claim_1",
            ),
            AIMessage(
                content="",
                tool_calls=[
                    {
                        "name": "submit_page_chunk_candidates",
                        "args": {"chunk_id": "chunk-1", "candidates": [{"name": "张三"}]},
                        "id": "submit_1",
                    }
                ],
            ),
            ToolMessage(
                content='{"batch_status":"saved","saved_count":1,"merged_count":0,"rejected_count":0,"failed_count":0,"total_saved_count":1,"chunk_status":"completed"}',
                tool_call_id="submit_1",
            ),
            AIMessage(
                content="",
                tool_calls=[{"name": "claim_next_page_chunk", "args": {}, "id": "claim_2"}],
            ),
            ToolMessage(
                content='{"status":"ok","chunk_id":"chunk-2","source_url":"https://example.edu/list?page=2","chunk_index":0,"content":"保留最近片段正文"}',
                tool_call_id="claim_2",
            ),
            AIMessage(
                content="",
                tool_calls=[
                    {
                        "name": "submit_page_chunk_candidates",
                        "args": {"chunk_id": "chunk-2", "candidates": [{"name": "李四"}]},
                        "id": "submit_2",
                    }
                ],
            ),
            ToolMessage(
                content='{"batch_status":"saved","saved_count":1,"merged_count":0,"rejected_count":0,"failed_count":0,"total_saved_count":2,"chunk_status":"completed"}',
                tool_call_id="submit_2",
            ),
        ]
        captured: dict[str, object] = {}

        class Request:
            messages = original_messages
            tools: list[object] = []

            def override(self, **kwargs: object) -> object:
                captured.update(kwargs)
                return SimpleNamespace(
                    messages=kwargs.get("messages", self.messages),
                    tools=self.tools,
                )

        def handler(request: object) -> object:
            return request.messages

        result = SaveHistoryCompactionMiddleware().wrap_model_call(Request(), handler)
        serialized = "\n".join(str(message.content) for message in result)

        self.assertEqual(result, captured["messages"])
        self.assertIn("已完成页面片段历史已压缩", serialized)
        self.assertNotIn("旧片段正文", serialized)
        self.assertIn("保留最近片段正文", serialized)

    def test_run_agent_starts_with_claim_prompt_when_chunks_are_pending(self) -> None:
        async def run() -> str:
            captured: dict[str, object] = {}

            class FakeAgent:
                async def astream(self, input_payload: object, **kwargs: object):
                    captured["input_payload"] = input_payload
                    captured["kwargs"] = kwargs
                    yield {"event_type": "done"}

            ctx = CrawlToolContext(
                job_id=1,
                start_url="https://cs.example.edu/faculty",
                university="示例大学",
                school="计算机学院",
                session_factory=object(),  # type: ignore[arg-type]
            )
            profile = LLMProfile(name="test", provider="openai", api_key="sk-test", model_name="gpt-test")

            with (
                patch("app.agents.faculty_crawler_agent.crawl_job_has_pending_work", AsyncMock(return_value=True)),
                patch("app.agents.faculty_crawler_agent.create_faculty_crawler_agent", return_value=FakeAgent()),
                patch("app.agents.faculty_crawler_agent._ensure_agent_job_can_continue", AsyncMock()),
            ):
                await run_faculty_crawler_agent(ctx, profile)

            payload = captured["input_payload"]
            assert isinstance(payload, dict)
            return str(payload["messages"][0]["content"])

        prompt = __import__("asyncio").run(run())

        self.assertIn("已有待处理页面片段", prompt)
        self.assertIn("立即调用 claim_next_page_chunk", prompt)
        self.assertIn("不要重新抓取入口页", prompt)

    def test_legacy_save_tool_is_not_exposed_to_agent(self) -> None:
        captured_tools: dict[str, object] = {}

        def fake_create_deep_agent(**kwargs: object) -> object:
            captured_tools["tools"] = kwargs["tools"]
            return SimpleNamespace()

        ctx = CrawlToolContext(
            job_id=1,
            start_url="https://cs.example.edu/faculty",
            university="示例大学",
            school="计算机学院",
            session_factory=object(),  # type: ignore[arg-type]
        )
        profile = LLMProfile(name="test", provider="openai", api_key="sk-test", model_name="gpt-test")

        with (
            patch("app.agents.faculty_crawler_agent.create_deep_agent", side_effect=fake_create_deep_agent),
            patch("app.agents.faculty_crawler_agent.build_faculty_crawler_model", return_value=object()),
        ):
            from app.agents.faculty_crawler_agent import create_faculty_crawler_agent

            create_faculty_crawler_agent(ctx, profile)

        tool_names = {getattr(tool, "name", "") for tool in captured_tools["tools"]}
        self.assertEqual(
            tool_names,
            {
                "crawl_page",
                "investigate_with_browser",
                "claim_next_page_chunk",
                "submit_page_chunk_candidates",
            },
        )
        self.assertNotIn("save_professor_candidates", tool_names)
        self.assertNotIn("submit_chunk_candidates", tool_names)

    def test_browser_investigate_chunks_successful_page_snapshot(self) -> None:
        async def run() -> dict[str, object]:
            captured_tools: dict[str, object] = {}

            def fake_create_deep_agent(**kwargs: object) -> object:
                captured_tools["tools"] = kwargs["tools"]
                return SimpleNamespace()

            snapshot = PageSnapshot(
                page_id=123,
                url="https://cs.example.edu/faculty",
                title="师资队伍",
                text="张三\n教授\n机器学习",
                html="<main>张三</main>",
                links=[],
                fetch_method="browser",
                status="succeeded",
            )
            ctx = CrawlToolContext(
                job_id=1,
                start_url="https://cs.example.edu/faculty",
                university="示例大学",
                school="计算机学院",
                session_factory=object(),  # type: ignore[arg-type]
            )
            profile = LLMProfile(name="test", provider="openai", api_key="sk-test", model_name="gpt-test")

            with (
                patch("app.agents.faculty_crawler_agent.crawl_job_has_pending_work", AsyncMock(return_value=False)),
                patch("app.agents.faculty_crawler_agent.get_source_url_chunk_state", AsyncMock(return_value=None)),
                patch("app.agents.faculty_crawler_agent.browser_investigate", AsyncMock(return_value=snapshot)),
                patch("app.agents.faculty_crawler_agent.create_chunks_for_successful_page_snapshot", AsyncMock(return_value=1)),
                patch("app.agents.faculty_crawler_agent.create_deep_agent", side_effect=fake_create_deep_agent),
                patch("app.agents.faculty_crawler_agent.build_faculty_crawler_model", return_value=object()),
            ):
                from app.agents.faculty_crawler_agent import create_faculty_crawler_agent

                create_faculty_crawler_agent(ctx, profile)
                browser_tool = next(tool for tool in captured_tools["tools"] if getattr(tool, "name", "") == "investigate_with_browser")
                return await browser_tool.ainvoke({"url": "https://cs.example.edu/faculty", "goal": "查看导师列表"})

        result = __import__("asyncio").run(run())

        self.assertEqual(result["status"], "chunked")
        self.assertEqual(result["created_chunks"], 1)
        self.assertNotIn("text", result)
        self.assertNotIn("html", result)

    def test_browser_investigate_returns_chunk_instruction_when_chunks_are_pending(self) -> None:
        async def run() -> dict[str, object]:
            captured_tools: dict[str, object] = {}

            def fake_create_deep_agent(**kwargs: object) -> object:
                captured_tools["tools"] = kwargs["tools"]
                return SimpleNamespace()

            ctx = CrawlToolContext(
                job_id=1,
                start_url="https://cs.example.edu/faculty",
                university="示例大学",
                school="计算机学院",
                session_factory=object(),  # type: ignore[arg-type]
            )
            profile = LLMProfile(name="test", provider="openai", api_key="sk-test", model_name="gpt-test")

            with (
                patch("app.agents.faculty_crawler_agent.crawl_job_has_pending_work", AsyncMock(return_value=True)),
                patch("app.agents.faculty_crawler_agent.browser_investigate", AsyncMock()) as browser_mock,
                patch("app.agents.faculty_crawler_agent.create_deep_agent", side_effect=fake_create_deep_agent),
                patch("app.agents.faculty_crawler_agent.build_faculty_crawler_model", return_value=object()),
            ):
                from app.agents.faculty_crawler_agent import create_faculty_crawler_agent

                create_faculty_crawler_agent(ctx, profile)
                browser_tool = next(tool for tool in captured_tools["tools"] if getattr(tool, "name", "") == "investigate_with_browser")
                result = await browser_tool.ainvoke({"url": "https://cs.example.edu/faculty", "goal": "查看导师列表"})

            browser_mock.assert_not_awaited()
            return result

        result = __import__("asyncio").run(run())

        self.assertEqual(result["status"], "chunk_required")
        self.assertIn("claim_next_page_chunk", result["next_instruction"])
        self.assertNotIn("content", result)

    def test_submit_page_chunk_candidates_requires_chunk_id(self) -> None:
        captured_tools: dict[str, object] = {}

        def fake_create_deep_agent(**kwargs: object) -> object:
            captured_tools["tools"] = kwargs["tools"]
            return SimpleNamespace()

        ctx = CrawlToolContext(
            job_id=1,
            start_url="https://cs.example.edu/faculty",
            university="示例大学",
            school="计算机学院",
            session_factory=object(),  # type: ignore[arg-type]
        )
        profile = LLMProfile(name="test", provider="openai", api_key="sk-test", model_name="gpt-test")

        with (
            patch("app.agents.faculty_crawler_agent.create_deep_agent", side_effect=fake_create_deep_agent),
            patch("app.agents.faculty_crawler_agent.build_faculty_crawler_model", return_value=object()),
        ):
            from app.agents.faculty_crawler_agent import create_faculty_crawler_agent

            create_faculty_crawler_agent(ctx, profile)

        submit_tool = next(tool for tool in captured_tools["tools"] if getattr(tool, "name", "") == "submit_page_chunk_candidates")
        schema = submit_tool.args_schema.model_json_schema()
        self.assertIn("chunk_id", schema["required"])
        self.assertIn("chunk_status", schema["required"])
        self.assertIn("candidates", schema["required"])

    def test_crawl_page_returns_already_completed_for_finished_chunk_page(self) -> None:
        async def run() -> dict[str, object]:
            captured_tools: dict[str, object] = {}

            def fake_create_deep_agent(**kwargs: object) -> object:
                captured_tools["tools"] = kwargs["tools"]
                return SimpleNamespace()

            ctx = CrawlToolContext(
                job_id=1,
                start_url="https://cs.example.edu/faculty",
                university="示例大学",
                school="计算机学院",
                session_factory=object(),  # type: ignore[arg-type]
            )
            profile = LLMProfile(name="test", provider="openai", api_key="sk-test", model_name="gpt-test")

            with (
                patch("app.agents.faculty_crawler_agent.get_source_url_chunk_state", AsyncMock(return_value="completed")),
                patch("app.agents.faculty_crawler_agent.crawl_page_with_crawl4ai", AsyncMock()) as crawl_page_mock,
                patch("app.agents.faculty_crawler_agent.create_deep_agent", side_effect=fake_create_deep_agent),
                patch("app.agents.faculty_crawler_agent.build_faculty_crawler_model", return_value=object()),
            ):
                from app.agents.faculty_crawler_agent import create_faculty_crawler_agent

                create_faculty_crawler_agent(ctx, profile)
                tools = captured_tools["tools"]
                crawl_tool = next(tool for tool in tools if getattr(tool, "name", "") == "crawl_page")
                result = await crawl_tool.ainvoke({"url": "https://cs.example.edu/faculty"})

            crawl_page_mock.assert_not_awaited()
            return result

        result = __import__("asyncio").run(run())

        self.assertEqual(result["status"], "already_completed")
        self.assertIn("不返回页面内容", result["message"])
        self.assertNotIn("content", result)


class FacultyCrawlerAgentModelTests(unittest.TestCase):
    def test_crawler_model_passes_extra_body_when_provided(self) -> None:
        profile = LLMProfile(
            name="acme",
            provider="openai",
            api_base_url="https://api.acme.ai/v1",
            api_key="sk-test",
            model_name="acme-think-v1",
        )

        with patch("app.agents.faculty_crawler_agent.ChatOpenAI") as chat_openai:
            build_faculty_crawler_model(
                profile,
                extra_body={"thinking": {"type": "disabled"}},
            )

        kwargs = chat_openai.call_args.kwargs
        self.assertEqual(kwargs["extra_body"], {"thinking": {"type": "disabled"}})

    def test_crawler_model_omits_extra_body_when_none(self) -> None:
        profile = LLMProfile(
            name="OpenAI",
            provider="openai",
            api_base_url="https://api.openai.com/v1",
            api_key="sk-test",
            model_name="gpt-4o-mini",
        )

        with patch("app.agents.faculty_crawler_agent.ChatOpenAI") as chat_openai:
            build_faculty_crawler_model(profile, extra_body=None)

        self.assertNotIn("extra_body", chat_openai.call_args.kwargs)

    def test_crawler_model_no_longer_relies_on_is_deepseek_profile(self) -> None:
        # Even an unmistakeably DeepSeek profile must not implicitly enable any extra_body
        # when the caller did not pass one. Adaptation now happens upstream.
        profile = LLMProfile(
            name="DeepSeek",
            provider="deepseek",
            api_base_url="https://api.deepseek.com/v1",
            api_key="sk-test",
            model_name="deepseek-chat",
        )

        with patch("app.agents.faculty_crawler_agent.ChatOpenAI") as chat_openai:
            build_faculty_crawler_model(profile)

        self.assertNotIn("extra_body", chat_openai.call_args.kwargs)


if __name__ == "__main__":
    unittest.main()
