"use client";

import { useEffect, useRef, useState } from "react";
import { IconButton } from "@/components/ui/Button";
import { CheckIcon, MoonIcon, SunIcon } from "@/components/icons";
import { THEMES, useTheme, type Theme } from "@/lib/theme";

/**
 * Manual override for the OS-level `prefers-color-scheme`. Persisted to
 * localStorage and applied via `data-theme` on <html> (see globals.css) — the
 * blocking inline script in layout.tsx applies any stored preference before
 * paint, so this component's own first client render (state still null,
 * matching its SSR output) never causes a visible flash.
 *
 * A menu rather than the button that used to flip between two. With three,
 * a single button can only name where it is going next, and the third is
 * reachable only by pressing twice and watching what happens.
 */
export function ThemeToggle() {
  const { theme, isDark, choose } = useTheme();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointerDown(event: MouseEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function pick(next: Theme) {
    choose(next);
    setOpen(false);
  }

  return (
    <div ref={wrapRef} className="relative">
      <IconButton
        type="button"
        onClick={() => setOpen((on) => !on)}
        aria-label="Change theme"
        title="Change theme"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {isDark ? <SunIcon /> : <MoonIcon />}
      </IconButton>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-44 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-xl"
        >
          {THEMES.map((option) => (
            <button
              key={option.value}
              type="button"
              role="menuitemradio"
              aria-checked={theme === option.value}
              onClick={() => pick(option.value)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-black/[.04] dark:hover:bg-white/[.06]"
            >
              {/* The tick keeps its width whether or not it is drawn, so the
                  three labels line up rather than shifting as the choice
                  moves between them. */}
              <span className="flex w-4 justify-center text-brand">
                {theme === option.value ? <CheckIcon /> : null}
              </span>
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
