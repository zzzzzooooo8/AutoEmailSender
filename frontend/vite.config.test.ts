import { describe, expect, it } from "vitest";
import { getApiProxyTarget } from "./vite.proxy";

describe("vite api proxy target", () => {
  it("uses the non-8000 development backend port by default", () => {
    expect(getApiProxyTarget({})).toBe("http://127.0.0.1:8010");
  });

  it("allows overriding the API proxy target with an environment variable", () => {
    expect(
      getApiProxyTarget({
        VITE_API_PROXY_TARGET: " http://127.0.0.1:49000 ",
      }),
    ).toBe("http://127.0.0.1:49000");
  });
});
