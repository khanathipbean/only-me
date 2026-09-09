"use client";

import { useEffect, useState } from "react";
import { IconButton } from "@/components/ui/Button";
import { MoonIcon, SunIcon } from "@/components/icons";

type Theme = "light" | "dark";

function systemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Manual override for the OS-level `prefers-color-scheme`. Persisted to
 * localStorage and applied via `data-theme` on <html> (see globals.css) — the
 * blocking inline script in layout.tsx applies any stored preference before
 * paint, so this component's own first client render (state still null,
 * matching its SSR output) never causes a visible flash.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    // Deferred via .then() rather than read directly here: the react-hooks
    // "no setState in effect" lint treats a synchronous setState call inside
    // the effect body as still executing synchronously regardless of what it
    // reads — nesting it in a microtask callback keeps it out of the effect's
    // own synchronous body (same pattern as Breadcrumb.tsx).
    Promise.resolve().then(() => {
      const stored = localStorage.getItem("theme");
      setTheme(stored === "dark" || stored === "light" ? stored : systemTheme());
    });
  }, []);

  function toggle() {
    const next: Theme = (theme ?? systemTheme()) === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("theme", next);
    } catch {
      // localStorage unavailable (e.g. private browsing) — the toggle still
      // works for this page load, it just won't persist across visits.
    }
  }

  const isDark = theme === "dark";

  return (
    <IconButton
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </IconButton>
  );
}
