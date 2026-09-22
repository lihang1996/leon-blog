"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const VIEWBOX_SIZE = 32;
const CURSOR_SIZE = 28;
const HOTSPOT = { x: 10, y: 6 } as const;
const HOTSPOT_OFFSET = {
  x: (HOTSPOT.x / VIEWBOX_SIZE) * CURSOR_SIZE,
  y: (HOTSPOT.y / VIEWBOX_SIZE) * CURSOR_SIZE,
};

const CURSOR_COLORS = {
  lightOrange: "#F6A54B",
  darkOrange: "#E65A00",
  outline: "#2D1B0A",
} as const;

type PawCursorState = "default" | "hover" | "pressed" | "stamp" | "text";
type PointerIntent = Exclude<PawCursorState, "stamp">;

interface Stamp {
  id: number;
  x: number;
  y: number;
  rotation: number;
}

const TEXT_AREA_SELECTOR = [
  "input",
  "textarea",
  "select",
  "[contenteditable=\"true\"]",
  "pre",
  "code",
  ".code-container",
  ".post-prose",
  ".markdown-body",
].join(",");

const INTERACTIVE_SELECTOR = [
  "a",
  "button",
  "summary",
  "[role=\"button\"]",
  "[role=\"link\"]",
  "[data-cursor-interactive]",
].join(",");

function getPointerIntent(target: EventTarget | null): PointerIntent {
  if (!(target instanceof Element)) return "default";
  if (target.closest(TEXT_AREA_SELECTOR)) return "text";
  if (target.closest(INTERACTIVE_SELECTOR)) return "hover";
  return "default";
}

function PawShape({
  fill,
  className,
}: {
  fill: string;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g
        fill={fill}
        stroke={CURSOR_COLORS.outline}
        strokeLinejoin="round"
        strokeWidth="1.5"
      >
        <ellipse cx="16" cy="21" rx="7" ry="5.4" />
        <circle cx="7.4" cy="12.6" r="3" />
        <circle cx="13" cy="8.6" r="3.1" />
        <circle cx="19" cy="8.6" r="3.1" />
        <circle cx="24.6" cy="12.6" r="3" />
      </g>
    </svg>
  );
}

function isPublicPath(pathname: string | null) {
  return pathname !== null && !pathname.startsWith("/admin");
}

export function PawCursor() {
  const pathname = usePathname();
  const cursorRef = useRef<HTMLSpanElement>(null);
  const frameRef = useRef<number | null>(null);
  const positionRef = useRef({ x: 0, y: 0 });
  const stampIdRef = useRef(0);
  const [enabled, setEnabled] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [visible, setVisible] = useState(false);
  const [state, setState] = useState<PawCursorState>("default");
  const [stamps, setStamps] = useState<Stamp[]>([]);

  useEffect(() => {
    if (!isPublicPath(pathname)) {
      document.documentElement.removeAttribute("data-paw-cursor");
      return;
    }

    const finePointerQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    const updateFinePointer = () => {
      const nextEnabled = finePointerQuery.matches;
      document.documentElement.toggleAttribute("data-paw-cursor", nextEnabled);
      setEnabled(nextEnabled);
    };
    const updateReducedMotion = () => setReducedMotion(reducedMotionQuery.matches);

    updateFinePointer();
    updateReducedMotion();
    finePointerQuery.addEventListener("change", updateFinePointer);
    reducedMotionQuery.addEventListener("change", updateReducedMotion);

    return () => {
      document.documentElement.removeAttribute("data-paw-cursor");
      finePointerQuery.removeEventListener("change", updateFinePointer);
      reducedMotionQuery.removeEventListener("change", updateReducedMotion);
    };
  }, [pathname]);

  useEffect(() => {
    if (!enabled || !isPublicPath(pathname)) return;

    const updatePosition = () => {
      frameRef.current = null;
      const cursor = cursorRef.current;
      if (!cursor) return;

      const { x, y } = positionRef.current;
      cursor.style.left = `${x - HOTSPOT_OFFSET.x}px`;
      cursor.style.top = `${y - HOTSPOT_OFFSET.y}px`;
    };

    const schedulePositionUpdate = (x: number, y: number) => {
      positionRef.current = { x, y };
      if (frameRef.current === null) {
        frameRef.current = window.requestAnimationFrame(updatePosition);
      }
    };

    const updateStateFromTarget = (target: EventTarget | null) => {
      const nextIntent = getPointerIntent(target);
      setState((currentState) => {
        if (currentState === "pressed" && nextIntent !== "text") return "pressed";
        return nextIntent;
      });
      return nextIntent;
    };

    const hideCursor = () => {
      setVisible(false);
      setState("default");
    };

    const handlePointerMove = (event: PointerEvent) => {
      schedulePositionUpdate(event.clientX, event.clientY);
      const nextIntent = updateStateFromTarget(event.target);
      if (nextIntent === "text") {
        setVisible(false);
        return;
      }
      setVisible(true);
    };

    const handlePointerDown = (event: PointerEvent) => {
      schedulePositionUpdate(event.clientX, event.clientY);
      if (getPointerIntent(event.target) !== "text") setState("pressed");
    };

    const handlePointerUp = (event: PointerEvent) => {
      const nextIntent = getPointerIntent(document.elementFromPoint(event.clientX, event.clientY));
      setState(nextIntent);
    };

    const handleClick = (event: MouseEvent) => {
      if (reducedMotion || getPointerIntent(event.target) === "text") return;

      const stamp: Stamp = {
        id: ++stampIdRef.current,
        x: event.clientX,
        y: event.clientY,
        rotation: Math.random() * 24 - 12,
      };
      setStamps((currentStamps) => [...currentStamps, stamp].slice(-3));
    };

    // pointerleave / mouseleave on <html> fire when the pointer exits the document
    // even if the window keeps focus (common when leaving through the top chrome).
    const handleDocumentLeave = (event: PointerEvent | MouseEvent) => {
      const related = event.relatedTarget;
      if (related instanceof Node && document.documentElement.contains(related)) return;
      hideCursor();
    };

    const handleVisibilityChange = () => {
      if (document.hidden) hideCursor();
    };

    document.addEventListener("pointermove", handlePointerMove, { passive: true });
    document.addEventListener("pointerdown", handlePointerDown, { passive: true });
    document.addEventListener("pointerup", handlePointerUp, { passive: true });
    document.addEventListener("click", handleClick, { passive: true });
    document.documentElement.addEventListener("pointerleave", handleDocumentLeave);
    document.documentElement.addEventListener("mouseleave", handleDocumentLeave);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", hideCursor);

    return () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("pointerup", handlePointerUp);
      document.removeEventListener("click", handleClick);
      document.documentElement.removeEventListener("pointerleave", handleDocumentLeave);
      document.documentElement.removeEventListener("mouseleave", handleDocumentLeave);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", hideCursor);
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    };
  }, [enabled, pathname, reducedMotion]);

  if (!enabled || !isPublicPath(pathname)) return null;

  const pawFill = state === "hover" || state === "pressed"
    ? CURSOR_COLORS.darkOrange
    : CURSOR_COLORS.lightOrange;

  return (
    <>
      {stamps.map((stamp) => (
        <span
          aria-hidden="true"
          className="paw-cursor-stamp"
          key={stamp.id}
          onAnimationEnd={() => {
            setStamps((currentStamps) => currentStamps.filter((item) => item.id !== stamp.id));
          }}
          style={{
            left: stamp.x,
            top: stamp.y,
            transform: `translate(-50%, -50%) rotate(${stamp.rotation}deg)`,
          }}
        >
          <PawShape fill={CURSOR_COLORS.lightOrange} className="paw-cursor-stamp__icon" />
        </span>
      ))}

      <span
        aria-hidden="true"
        className="paw-cursor"
        data-hotspot={`${HOTSPOT.x},${HOTSPOT.y}`}
        data-reduced-motion={reducedMotion ? "true" : "false"}
        data-state={state}
        ref={cursorRef}
        style={{ visibility: visible && state !== "text" ? "visible" : "hidden" }}
      >
        <PawShape fill={pawFill} className="paw-cursor__icon" />
      </span>
    </>
  );
}
