import { createRef, useRef, useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FloatingMenuPortal } from "@/components/molecules/FloatingMenuPortal";

type RectConfig = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

const MenuHarness = () => {
  const [open, setOpen] = useState(true);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  return (
    <>
      <button ref={buttonRef} type="button">
        占位符
      </button>
      <FloatingMenuPortal
        open={open}
        anchorRef={buttonRef}
        testId="floating-menu"
        onClose={() => setOpen(false)}
      >
        <button type="button">导师姓名</button>
      </FloatingMenuPortal>
    </>
  );
};

const DEFAULT_RECT: RectConfig = {
  left: 240,
  right: 340,
  top: 160,
  bottom: 200,
};

const PositionedMenuHarness = ({
  rectRef = { current: DEFAULT_RECT },
}: {
  rectRef?: { current: RectConfig };
}) => {
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  return (
    <>
      <button
        ref={(node) => {
          buttonRef.current = node;
          if (node) {
            node.getBoundingClientRect = () =>
              ({
                ...rectRef.current,
                width: rectRef.current.right - rectRef.current.left,
                height: rectRef.current.bottom - rectRef.current.top,
                x: rectRef.current.left,
                y: rectRef.current.top,
                toJSON: () => ({}),
              }) as DOMRect;
          }
        }}
        type="button"
      >
        占位符
      </button>
      <FloatingMenuPortal
        open={true}
        anchorRef={buttonRef}
        testId="floating-menu"
        onClose={vi.fn()}
      >
        <button type="button">导师姓名</button>
      </FloatingMenuPortal>
    </>
  );
};

describe("FloatingMenuPortal", () => {
  it("keeps the menu hidden until an anchor can be measured", () => {
    const emptyAnchorRef = createRef<HTMLButtonElement>();

    render(
      <FloatingMenuPortal
        open={true}
        anchorRef={emptyAnchorRef}
        testId="floating-menu"
        onClose={vi.fn()}
      >
        <button type="button">导师姓名</button>
      </FloatingMenuPortal>,
    );

    expect(screen.getByTestId("floating-menu")).toHaveStyle({
      visibility: "hidden",
    });
  });

  it("keeps the menu open and realigns it when the page scrolls", () => {
    const rectRef = { current: DEFAULT_RECT };
    render(<PositionedMenuHarness rectRef={rectRef} />);

    rectRef.current = {
      left: 220,
      right: 320,
      top: 120,
      bottom: 160,
    };
    fireEvent.scroll(document);

    const menu = screen.getByTestId("floating-menu");
    expect(menu).toBeInTheDocument();
    expect(menu.style.left).toBe("220px");
    expect(menu.style.top).toBe("168px");
  });

  it("writes pixel-based coordinates when positioning the menu", () => {
    render(<PositionedMenuHarness />);

    const menu = screen.getByTestId("floating-menu");

    expect(menu.style.left).toBe("240px");
    expect(menu.style.top).toBe("208px");
    expect(menu.style.minWidth).toBe("180px");
    expect(menu.style.maxHeight).toBe("320px");
    expect(menu).toHaveStyle({ visibility: "visible" });
  });

  it("keeps the menu open when scrolling inside the menu", () => {
    render(<MenuHarness />);

    fireEvent.wheel(screen.getByTestId("floating-menu"));

    expect(screen.getByTestId("floating-menu")).toBeInTheDocument();
  });
});
