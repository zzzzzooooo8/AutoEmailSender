import { beforeEach, describe, expect, it, vi } from "vitest";

const diagnosticsStorageKey = "auto-email-diagnostics:v1";
const diagnosticsSessionStorageKey = "auto-email-diagnostics-session:v1";

type DiagnosticsModule = typeof import("@/lib/diagnostics");

async function loadDiagnostics(): Promise<DiagnosticsModule> {
  vi.resetModules();
  return import("@/lib/diagnostics");
}

function createThrowingStorage(): Storage {
  return {
    get length() {
      throw new Error("storage unavailable");
    },
    clear: vi.fn(() => {
      throw new Error("storage unavailable");
    }),
    getItem: vi.fn(() => {
      throw new Error("storage unavailable");
    }),
    key: vi.fn(() => {
      throw new Error("storage unavailable");
    }),
    removeItem: vi.fn(() => {
      throw new Error("storage unavailable");
    }),
    setItem: vi.fn(() => {
      throw new Error("storage unavailable");
    }),
  };
}

describe("diagnostics", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("records, reads, and clears diagnostic events in write order", async () => {
    const { clearDiagnosticEvents, getDiagnosticEvents, recordDiagnosticEvent } = await loadDiagnostics();

    const first = recordDiagnosticEvent({
      level: "info",
      category: "user_action",
      eventName: "task.created",
      message: "创建任务",
      data: { taskId: "task-1" },
    });
    const second = recordDiagnosticEvent({
      level: "warn",
      category: "api",
      eventName: "professors.fetch.slow",
    });

    expect(getDiagnosticEvents()).toEqual([first, second]);
    expect(first).toMatchObject({
      level: "info",
      category: "user_action",
      eventName: "task.created",
      message: "创建任务",
      data: { taskId: "task-1" },
    });
    expect(first.id).not.toBe(second.id);
    expect(new Date(first.timestamp).toISOString()).toBe(first.timestamp);
    expect(first.sessionId).toBe(second.sessionId);

    clearDiagnosticEvents();

    expect(getDiagnosticEvents()).toEqual([]);
  });

  it("keeps only the latest 500 events", async () => {
    const { getDiagnosticEvents, recordDiagnosticEvent } = await loadDiagnostics();

    for (let index = 0; index < 505; index += 1) {
      recordDiagnosticEvent({
        level: "debug",
        category: "system",
        eventName: `event.${index}`,
      });
    }

    const events = getDiagnosticEvents();
    expect(events).toHaveLength(500);
    expect(events[0].eventName).toBe("event.5");
    expect(events[499].eventName).toBe("event.504");
  });

  it("returns an empty list when localStorage contains invalid JSON", async () => {
    window.localStorage.setItem(diagnosticsStorageKey, "{not-json");
    const { getDiagnosticEvents } = await loadDiagnostics();

    expect(getDiagnosticEvents()).toEqual([]);
  });

  it("does not throw when storage is unavailable", async () => {
    vi.stubGlobal("localStorage", createThrowingStorage());
    vi.stubGlobal("sessionStorage", createThrowingStorage());
    const { exportDiagnosticEvents, getDiagnosticEvents, recordDiagnosticEvent } = await loadDiagnostics();

    expect(() =>
      recordDiagnosticEvent({
        level: "error",
        category: "frontend_error",
        eventName: "render.failed",
        data: { component: "Editor" },
      }),
    ).not.toThrow();
    expect(() => getDiagnosticEvents()).not.toThrow();
    expect(() => exportDiagnosticEvents()).not.toThrow();
    expect(JSON.parse(exportDiagnosticEvents())).toMatchObject({
      sessionId: expect.any(String),
      events: expect.any(Array),
    });
  });

  it("serializes unsafe data without failing the record operation", async () => {
    const { getDiagnosticEvents, recordDiagnosticEvent } = await loadDiagnostics();
    const circular: Record<string, unknown> = { name: "root" };
    circular.self = circular;

    recordDiagnosticEvent({
      level: "error",
      category: "frontend_error",
      eventName: "save.failed",
      data: {
        error: new Error("保存失败"),
        response: new Response("nope", { status: 500, statusText: "Server Error" }),
        circular,
        onClick: () => undefined,
      },
    });

    const [event] = getDiagnosticEvents();
    expect(event.data).toEqual({
      error: { name: "Error", message: "保存失败" },
      response: { ok: false, redirected: false, status: 500, statusText: "Server Error", type: "default", url: "" },
      circular: { name: "root", self: "[Circular]" },
      onClick: "[Function]",
    });
  });

  it("exports formatted JSON with metadata", async () => {
    const { exportDiagnosticEvents, getDiagnosticSessionId, recordDiagnosticEvent } = await loadDiagnostics();
    recordDiagnosticEvent({
      level: "info",
      category: "user_action",
      eventName: "workspace.opened",
    });

    const exported = exportDiagnosticEvents();
    expect(exported).toContain("\n  ");
    expect(JSON.parse(exported)).toMatchObject({
      exportedAt: expect.any(String),
      sessionId: getDiagnosticSessionId(),
      events: [{ eventName: "workspace.opened" }],
    });
  });

  it("keeps a stable session id across module reloads and browser refresh storage", async () => {
    const firstModule = await loadDiagnostics();
    const firstSessionId = firstModule.getDiagnosticSessionId();
    const storedSessionId = window.sessionStorage.getItem(diagnosticsSessionStorageKey);

    const secondModule = await loadDiagnostics();

    expect(secondModule.getDiagnosticSessionId()).toBe(firstSessionId);
    expect(storedSessionId).toBe(firstSessionId);
  });
});
