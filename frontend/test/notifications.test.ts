import { describe, expect, it } from "vitest";
import {
  MAX_VISIBLE_NOTIFICATIONS,
  calculateNotificationDuration,
  createFormErrorNotification,
  createNotificationRecord,
  trimNotifications,
  type NotificationDraft,
} from "@/lib/notifications";

const buildDraft = (overrides: Partial<NotificationDraft> = {}): NotificationDraft => ({
  level: "success",
  title: "保存成功",
  description: "已更新导师配置",
  details: [],
  ...overrides,
});

describe("calculateNotificationDuration", () => {
  it("uses the exact success formula for the base value", () => {
    expect(
      calculateNotificationDuration(
        buildDraft({
          level: "success",
          title: "abcd",
          description: "",
          details: [],
        }),
      ),
    ).toBe(2380);
  });

  it("counts title, description, and details when measuring text length", () => {
    expect(
      calculateNotificationDuration(
        buildDraft({
          level: "success",
          title: "ab",
          description: "cde",
          details: ["fg", "h"],
        }),
      ),
    ).toBe(2560);
  });

  it("clamps success notifications to the upper bound", () => {
    expect(
      calculateNotificationDuration(
        buildDraft({
          level: "success",
          title: "a".repeat(100),
          description: "",
          details: [],
        }),
      ),
    ).toBe(3000);
  });

  it("uses the exact warning formula for the base value", () => {
    expect(
      calculateNotificationDuration(
        buildDraft({
          level: "warning",
          title: "abcd",
          description: "",
          details: [],
        }),
      ),
    ).toBe(3420);
  });

  it("clamps warning notifications to the upper bound", () => {
    expect(
      calculateNotificationDuration(
        buildDraft({
          level: "warning",
          title: "a".repeat(100),
          description: "",
          details: [],
        }),
      ),
    ).toBe(6000);
  });

  it("uses the exact error formula for the base value", () => {
    expect(
      calculateNotificationDuration(
        buildDraft({
          level: "error",
          title: "abcd",
          description: "",
          details: [],
        }),
      ),
    ).toBe(5460);
  });

  it("clamps error notifications to the upper bound", () => {
    expect(
      calculateNotificationDuration(
        buildDraft({
          level: "error",
          title: "a".repeat(100),
          description: "",
          details: [],
        }),
      ),
    ).toBe(8000);
  });
});

describe("createFormErrorNotification", () => {
  it("builds one aggregated error notification and keeps the error order", () => {
    expect(
      createFormErrorNotification("请检查表单", [
        "请输入任务名称",
        "",
        "请选择开始时间",
        "请选择结束时间",
      ]),
    ).toEqual({
      level: "error",
      title: "请检查表单",
      description: "",
      details: ["请输入任务名称", "请选择开始时间", "请选择结束时间"],
    });
  });
});

describe("createNotificationRecord", () => {
  it("builds the full notification record contract", () => {
    expect(
      createNotificationRecord(
        buildDraft({
          level: "warning",
          title: "abcd",
          description: "",
          details: [],
        }),
        {
          id: "notice-1",
          createdAt: 1234,
        },
      ),
    ).toEqual({
      level: "warning",
      title: "abcd",
      description: "",
      details: [],
      id: "notice-1",
      createdAt: 1234,
      durationMs: 3420,
      interactiveLocked: false,
      closing: false,
    });
  });

  it("uses 0 as the deterministic createdAt sentinel when omitted", () => {
    expect(
      createNotificationRecord(
        buildDraft({
          level: "success",
          title: "abcd",
          description: "",
          details: [],
        }),
        {
          id: "notice-2",
        },
      ).createdAt,
    ).toBe(0);
  });
});

describe("trimNotifications", () => {
  it("keeps only the latest visible notifications", () => {
    const notifications = ["1", "2", "3", "4", "5"].map((id) =>
      createNotificationRecord(buildDraft({ title: `第 ${id} 条` }), {
        id,
        createdAt: Number(id),
      }),
    );

    expect(trimNotifications(notifications).map((item) => item.id)).toEqual([
      "2",
      "3",
      "4",
      "5",
    ]);
    expect(MAX_VISIBLE_NOTIFICATIONS).toBe(4);
  });
});
