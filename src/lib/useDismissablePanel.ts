"use client";

import { useEffect, useRef, useState } from "react";

/**
 * State + wiring for a trigger button that opens a portalled, fixed-position
 * panel under it — the shape `AccountMenu` already hand-rolls. Extracted here
 * because `NotificationBell` needed the exact same outside-click/Escape/
 * scroll-closes-it behaviour as a third copy, which is the point past which
 * writing it a third time stops being the cheaper option.
 */
export function useDismissablePanel() {
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<{ top: number; right: number } | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  function toggle() {
    if (open) {
      setOpen(false);
      setBox(null);
      return;
    }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setBox({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    setOpen(true);
  }

  function close() {
    setOpen(false);
    setBox(null);
  }

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !panelRef.current?.contains(target)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    // Fixed coordinates go stale as soon as anything moves.
    function onScrollOrResize() {
      setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open]);

  return { open, box, toggle, close, triggerRef, panelRef };
}
