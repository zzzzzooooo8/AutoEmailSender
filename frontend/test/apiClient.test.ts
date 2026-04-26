import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch, buildApiPath, buildApiUrl } from "@/lib/api/client";

describe("api client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds encoded API paths while skipping empty query values", () => {
    expect(
      buildApiPath("/api/professors", {
        keyword: "大模型 导师",
        page: 2,
        archived: "",
        identity_id: null,
        llm_profile_id: undefined,
      }),
    ).toBe("/api/professors?keyword=%E5%A4%A7%E6%A8%A1%E5%9E%8B+%E5%AF%BC%E5%B8%88&page=2");
  });

  it("builds absolute API urls from the current browser origin", () => {
    expect(buildApiUrl("/api/ping")).toBe("http://localhost:3000/api/ping");
  });

  it("parses successful JSON responses and sends JSON content type by default", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(apiFetch("/api/ping", { method: "POST", body: JSON.stringify({ ok: true }) })).resolves.toEqual({
      status: "ok",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/ping",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );
  });

  it("does not force JSON content type when the request body is FormData", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));
    const formData = new FormData();
    formData.append("file", new Blob(["content"]), "resume.txt");

    await expect(apiFetch<void>("/api/materials", { method: "POST", body: formData })).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/materials",
      expect.objectContaining({
        headers: {},
      }),
    );
  });

  it("throws ApiError with backend detail, message, text, or fallback error messages", async () => {
    const cases = [
      [new Response(JSON.stringify({ detail: "未找到身份配置" }), { status: 404 }), "未找到身份配置"],
      [new Response(JSON.stringify({ message: "模型不可用" }), { status: 400 }), "模型不可用"],
      [new Response("服务暂不可用", { status: 503 }), "服务暂不可用"],
      [new Response("", { status: 500 }), "请求失败"],
    ] as const;

    for (const [response, message] of cases) {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(response);

      await expect(apiFetch("/api/fail")).rejects.toMatchObject<ApiError>({
        name: "Error",
        status: response.status,
        message,
      });
    }
  });

  it("extracts FastAPI validation detail arrays into readable error messages", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          detail: [
            {
              type: "value_error",
              loc: ["body", "start_url"],
              msg: "Value error, URL 不允许指向本机、内网或不可解析地址",
            },
          ],
        }),
        { status: 422 },
      ),
    );

    await expect(apiFetch("/api/crawl-jobs")).rejects.toMatchObject<ApiError>({
      status: 422,
      message: "URL 不允许指向本机、内网或不可解析地址",
    });
  });
});
