import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RouteScrollRestoration } from "@/components/organisms/RouteScrollRestoration";

const TestRoutes = () => (
  <>
    <RouteScrollRestoration />
    <Link to="/tasks">任务中心</Link>
    <Routes>
      <Route path="/" element={<div>首页</div>} />
      <Route path="/tasks" element={<div>任务中心页面</div>} />
    </Routes>
  </>
);

describe("RouteScrollRestoration", () => {
  beforeEach(() => {
    Object.defineProperty(window, "scrollTo", {
      configurable: true,
      value: vi.fn(),
    });
  });

  it("scrolls to the top when the route changes", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <TestRoutes />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(window.scrollTo).toHaveBeenCalledWith({
        left: 0,
        top: 0,
        behavior: "auto",
      });
    });

    vi.mocked(window.scrollTo).mockClear();
    fireEvent.click(screen.getByRole("link", { name: "任务中心" }));

    await waitFor(() => {
      expect(window.scrollTo).toHaveBeenCalledWith({
        left: 0,
        top: 0,
        behavior: "auto",
      });
    });
  });
});
