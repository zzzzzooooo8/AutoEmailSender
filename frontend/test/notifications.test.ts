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
  it("keeps success notifications in the 2-3 second band", () => {
    const duration = calculateNotificationDuration(
      buildDraft({ level: "success", title: "保存成功", description: "已更新导师配置" }),
    );

    expect(duration).toBeGreaterThanOrEqual(2000);
    expect(duration).toBeLessThanOrEqual(3000);
  });

  it("keeps warning notifications in the 3-6 second band", () => {
    const duration = calculateNotificationDuration(
      buildDraft({
        level: "warning",
        title: "请注意配置",
        description: "当前身份还没有默认材料，暂时无法计算匹配。",
      }),
    );

    expect(duration).toBeGreaterThanOrEqual(3000);
    expect(duration).toBeLessThanOrEqual(6000);
  });

  it("keeps error notifications in the 5-8 second band", () => {
    const duration = calculateNotificationDuration(
      buildDraft({
        level: "error",
        title: "请检查表单",
        details: ["请输入任务名称", "请选择开始时间", "请选择结束时间"],
      }),
    );

    expect(duration).toBeGreaterThanOrEqual(5000);
    expect(duration).toBeLessThanOrEqual(8000);
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
