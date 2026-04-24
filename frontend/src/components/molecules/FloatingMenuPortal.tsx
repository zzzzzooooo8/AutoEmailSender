import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";

type FloatingMenuPortalProps = {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  align?: "left" | "right";
  minWidth?: number;
  testId?: string;
  className?: string;
  children: ReactNode;
  onClose: () => void;
};

const VIEWPORT_MARGIN = 12;
const MENU_GAP = 8;
const DEFAULT_MAX_HEIGHT = 320;

export const FloatingMenuPortal = ({
  open,
  anchorRef,
  align = "left",
  minWidth = 180,
  testId,
  className,
  children,
  onClose,
}: FloatingMenuPortalProps) => {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [style, setStyle] = useState<CSSProperties>({
    left: VIEWPORT_MARGIN,
    top: VIEWPORT_MARGIN,
    minWidth,
    maxHeight: DEFAULT_MAX_HEIGHT,
  });

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor || typeof window === "undefined") {
      return;
    }

    const rect = anchor.getBoundingClientRect();
    const menuWidth = Math.max(minWidth, rect.width);
    const viewportWidth = window.innerWidth || 1024;
    const viewportHeight = window.innerHeight || 768;
    const preferredLeft = align === "right" ? rect.right - menuWidth : rect.left;
    const left = Math.min(
      Math.max(VIEWPORT_MARGIN, preferredLeft),
      Math.max(VIEWPORT_MARGIN, viewportWidth - menuWidth - VIEWPORT_MARGIN),
    );
    const belowSpace = viewportHeight - rect.bottom - VIEWPORT_MARGIN;
    const aboveSpace = rect.top - VIEWPORT_MARGIN;
    const openUpward = belowSpace < 220 && aboveSpace > belowSpace;
    const availableHeight = openUpward ? aboveSpace - MENU_GAP : belowSpace - MENU_GAP;

    setStyle({
      left,
      top: openUpward ? rect.top - MENU_GAP : rect.bottom + MENU_GAP,
      minWidth: menuWidth,
      maxHeight: Math.max(160, Math.min(DEFAULT_MAX_HEIGHT, availableHeight)),
      transform: openUpward ? "translateY(-100%)" : undefined,
    });
  }, [align, anchorRef, minWidth]);

  useEffect(() => {
    if (!open) {
      return;
    }

    updatePosition();
    const frame = window.requestAnimationFrame(updatePosition);

    window.addEventListener("resize", updatePosition);
    document.addEventListener("scroll", updatePosition, true);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updatePosition);
      document.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        menuRef.current?.contains(target) ||
        anchorRef.current?.contains(target)
      ) {
        return;
      }

      onClose();
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [anchorRef, onClose, open]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      ref={menuRef}
      data-testid={testId}
      className={clsx(
        "fixed z-[80] overflow-hidden rounded-2xl border border-stone-200 bg-white p-2 shadow-[0_18px_40px_-24px_rgba(41,37,36,0.38)]",
        className,
      )}
      style={style}
    >
      {children}
    </div>,
    document.body,
  );
};
