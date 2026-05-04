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

    let recordedEvent: ReturnType<typeof recordDiagnosticEvent> | undefined;
    expect(() => {
      recordedEvent = recordDiagnosticEvent({
        level: "error",
        category: "frontend_error",
        eventName: "render.failed",
        data: { component: "Editor" },
      });
    }).not.toThrow();
    expect(() => getDiagnosticEvents()).not.toThrow();
    expect(() => exportDiagnosticEvents()).not.toThrow();
    const events = getDiagnosticEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventName: "render.failed",
      data: { component: "Editor" },
      sessionId: recordedEvent?.sessionId,
    });
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

  it("uses safe placeholders when data serialization itself throws", async () => {
    const { getDiagnosticEvents, recordDiagnosticEvent } = await loadDiagnostics();
    const throwingGetter = {
      safe: "kept",
      get broken() {
        throw new Error("getter exploded");
      },
    };
    const throwingProxy = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error("proxy exploded");
        },
      },
    );

    expect(() =>
      recordDiagnosticEvent({
        level: "warn",
        category: "system",
        eventName: "serialization.failed",
        data: {
          invalidDate: new Date("not-a-date"),
          throwingGetter,
          throwingProxy,
        },
      }),
    ).not.toThrow();

    const [event] = getDiagnosticEvents();
    expect(event.data).toEqual({
      invalidDate: "[Invalid Date]",
      throwingGetter: { safe: "kept", broken: "[Unserializable]" },
      throwingProxy: "[Unserializable]",
    });
  });

  it("redacts sensitive fields and strips URL query and hash values", async () => {
    const { getDiagnosticEvents, recordDiagnosticEvent } = await loadDiagnostics();

    recordDiagnosticEvent({
      level: "info",
      category: "api",
      eventName: "api.request",
      data: {
        token: "secret-token",
        accessToken: "secret-access",
        refreshToken: "secret-refresh",
        apiKey: "secret-key",
        password: "secret-password",
        secret: "secret-value",
        authorization: "Bearer secret",
        cookie: "sid=secret",
        smtpPassword: "smtp-secret",
        api_token: "secret-api-token",
        client_secret: "secret-client",
        session_cookie: "sid=secret-session",
        authToken: "secret-auth",
        school: "Engineering",
        status: "active",
        nested: {
          url: "https://example.com/callback?token=secret#session",
          safe: "visible",
        },
        attempted_urls: ["https://api.example.com/v1?api_key=secret#debug"],
        response: new Response("ok", { status: 200 }),
      },
    });

    const [event] = getDiagnosticEvents();
    expect(event.data).toMatchObject({
      token: "[Redacted]",
      accessToken: "[Redacted]",
      refreshToken: "[Redacted]",
      apiKey: "[Redacted]",
      password: "[Redacted]",
      secret: "[Redacted]",
      authorization: "[Redacted]",
      cookie: "[Redacted]",
      smtpPassword: "[Redacted]",
      api_token: "[Redacted]",
      client_secret: "[Redacted]",
      session_cookie: "[Redacted]",
      authToken: "[Redacted]",
      school: "Engineering",
      status: "active",
      nested: {
        url: "https://example.com/callback",
        safe: "visible",
      },
      attempted_urls: ["https://api.example.com/v1"],
    });
    const serializedData = JSON.stringify(event.data);
    expect(serializedData).not.toContain("secret-token");
    expect(serializedData).not.toContain("secret-access");
    expect(serializedData).not.toContain("secret-api-token");
    expect(serializedData).not.toContain("secret-client");
    expect(serializedData).not.toContain("secret-session");
    expect(serializedData).not.toContain("secret-auth");
    expect(serializedData).not.toContain("Bearer secret");
    expect(serializedData).not.toContain("?token=secret");
    expect(serializedData).not.toContain("?api_key=secret");
    expect(serializedData).not.toContain("#session");
    expect(serializedData).not.toContain("#debug");
  });

  it("sanitizes top-level messages before storing and exporting diagnostics", async () => {
    const { exportDiagnosticEvents, getDiagnosticEvents, recordDiagnosticEvent } = await loadDiagnostics();

    recordDiagnosticEvent({
      level: "error",
      category: "api",
      eventName: "api.request_failed",
      message:
        "Failed https://example.com/path?a=secret#x token=secret-token Authorization: Bearer abc " +
        'cookie=sid=secret password=hunter2 apiKey=secret-key smtpPassword=mail-secret ' +
        '{"token":"json-secret","authorization":"Bearer json-abc","cookie":"sid=json-secret"}',
      data: {
        detail:
          '{"token":"data-secret","authorization":"Bearer data-abc","cookie":"sid=data-secret"} ' +
          "client_secret=data-client-secret status=active school=Engineering",
      },
    });

    const [event] = getDiagnosticEvents();
    expect(event.message).toContain("https://example.com/path");
    expect(event.message).toContain("[Redacted]");

    const stored = JSON.stringify(event);
    const exported = exportDiagnosticEvents();
    for (const value of [
      "secret-token",
      "Bearer abc",
      "sid=secret",
      "hunter2",
      "secret-key",
      "mail-secret",
      "json-secret",
      "json-abc",
      "data-secret",
      "data-abc",
      "data-client-secret",
      "?a=secret",
      "#x",
    ]) {
      expect(stored).not.toContain(value);
      expect(exported).not.toContain(value);
    }
  });

  it("redacts request and response body payload fields", async () => {
    const { getDiagnosticEvents, recordDiagnosticEvent } = await loadDiagnostics();

    recordDiagnosticEvent({
      level: "error",
      category: "api",
      eventName: "api.request_failed",
      data: {
        body: "raw request body with secret",
        requestBody: { email: "user@example.com", token: "secret-token" },
        request_body: "raw snake request body",
        responseBody: "raw response body",
        response_body: "raw snake response body",
        rawBody: "raw body",
        payload: { nested: "large payload" },
        safe: "visible",
      },
    });

    const [event] = getDiagnosticEvents();
    expect(event.data).toMatchObject({
      body: "[Redacted]",
      requestBody: "[Redacted]",
      request_body: "[Redacted]",
      responseBody: "[Redacted]",
      response_body: "[Redacted]",
      rawBody: "[Redacted]",
      payload: "[Redacted]",
      safe: "visible",
    });

    const serializedData = JSON.stringify(event.data);
    expect(serializedData).not.toContain("raw request body");
    expect(serializedData).not.toContain("raw response body");
    expect(serializedData).not.toContain("secret-token");
    expect(serializedData).not.toContain("large payload");
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
