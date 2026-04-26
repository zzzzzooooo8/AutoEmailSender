import { describe, expect, it } from "vitest";
import { validateTaskForm } from "@/features/create-task/server/validateTaskForm";
import type { CreateTaskFormData } from "@/features/create-task/types";

const buildFormData = (overrides: Partial<CreateTaskFormData> = {}): CreateTaskFormData => ({
  name: "博士申请批量邮件",
  mentorIds: ["mentor-1"],
  schedule: { type: "immediate" },
  emailContent: {
    subject: "申请与{{name}}老师交流",
    body: "{{name}}老师您好，我是{{sender_name}}。",
  },
  attachments: [],
  ...overrides,
});

describe("validateTaskForm", () => {
  it("accepts a complete immediate task and trims text fields for validation", () => {
    const result = validateTaskForm(
      buildFormData({
        name: "  博士申请批量邮件  ",
        emailContent: {
          subject: "  申请与{{name}}老师交流  ",
          body: "  {{name}}老师您好  ",
        },
      }),
    );

    expect(result).toEqual({ valid: true, errors: {} });
  });

  it("reports every required field error instead of stopping at the first one", () => {
    const result = validateTaskForm(
      buildFormData({
        name: "  ",
        mentorIds: [],
        emailContent: { subject: " ", body: "" },
      }),
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual({
      name: "请输入任务名称",
      mentors: "请至少选择一位导师",
      emailSubject: "请填写邮件主题",
      emailBody: "请填写邮件正文",
    });
  });

  it("requires scheduled task window fields and a positive send count", () => {
    const result = validateTaskForm(
      buildFormData({
        schedule: { type: "scheduled", emailsToSend: 0 },
      }),
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toMatchObject({
      startTime: "请选择开始时间",
      endTime: "请选择结束时间",
      emailsToSend: "请输入要发送的邮件数量",
    });
  });

  it("rejects a scheduled task whose end time is not later than the start time", () => {
    const result = validateTaskForm(
      buildFormData({
        schedule: {
          type: "scheduled",
          startTime: "18:30",
          endTime: "18:30",
          emailsToSend: 5,
        },
      }),
    );

    expect(result.valid).toBe(false);
    expect(result.errors.endTime).toBe("结束时间必须晚于开始时间");
  });
});
