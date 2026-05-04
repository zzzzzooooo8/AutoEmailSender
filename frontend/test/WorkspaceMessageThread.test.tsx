import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceMessageThread } from "@/components/organisms/WorkspaceMessageThread";
import type { WorkspaceMessageDTO } from "@/types";

const buildMessage = (
  overrides: Partial<WorkspaceMessageDTO> = {},
): WorkspaceMessageDTO => ({
  id: 1,
  direction: "sent",
  subject: "测试主题",
  content: "老师您好 重点内容 表格内容",
  content_html:
    '<p style="color: #111827;">老师您好 <strong>重点内容</strong></p><table><tbody><tr><td>表格内容</td></tr></tbody></table>',
  rfc_message_id: null,
  failure_summary: null,
  reply_headers: null,
  prompt_tokens: null,
  completion_tokens: null,
  total_tokens: null,
  created_at: "2026-04-22T10:00:00Z",
  ...overrides,
});

describe("WorkspaceMessageThread", () => {
  it("renders expanded message HTML with formatting when content_html exists", () => {
    render(<WorkspaceMessageThread messages={[buildMessage()]} />);

    fireEvent.click(screen.getByRole("button", { name: /展开/ }));

    expect(screen.getByText("重点内容").tagName).toBe("STRONG");
    expect(screen.getByText("表格内容").closest("table")).not.toBeNull();
    expect(screen.queryByText("老师您好 重点内容 表格内容")).not.toBeInTheDocument();
  });

  it("keeps sent HTML content visually inside the sent message bubble", () => {
    render(<WorkspaceMessageThread messages={[buildMessage()]} />);

    fireEvent.click(screen.getByRole("button", { name: /展开/ }));

    const htmlContainer = screen.getByText("重点内容").closest("[data-message-html]");

    expect(htmlContainer).toHaveClass("bg-white/10");
    expect(htmlContainer).toHaveClass("text-white/92");
    expect(htmlContainer).toHaveClass("[&_*]:!text-inherit");
    expect(htmlContainer).not.toHaveClass("bg-white");
    expect(htmlContainer).not.toHaveClass("text-stone-900");
  });

  it("uses a wider thread layout that matches the workspace frame", () => {
    render(<WorkspaceMessageThread messages={[buildMessage()]} />);

    expect(screen.getByText("通信记录").closest("[data-message-thread-inner]")).toHaveClass(
      "max-w-6xl",
    );
    expect(screen.getByRole("button", { name: /展开/ })).toHaveClass("max-w-[86%]");
  });

  it("shows reply monitoring status and a manual refresh action", () => {
    const handleRefresh = vi.fn();
    render(
      <WorkspaceMessageThread
        messages={[buildMessage()]}
        monitoringLabel="正在监听回复"
        lastCheckedAt={new Date("2026-04-22T10:30:00Z")}
        refreshing={false}
        newReceivedCount={1}
        onRefresh={handleRefresh}
      />,
    );

    expect(screen.getByText("正在监听回复")).toBeInTheDocument();
    expect(screen.getByText("新回复")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "刷新通信记录" }));

    expect(handleRefresh).toHaveBeenCalledTimes(1);
  });
});
