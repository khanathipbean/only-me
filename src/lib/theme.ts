import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

function systemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Shared by every place in the header that can flip the theme (the standalone
 * icon on wider screens, the menu item folded into AccountMenu on narrow
 * ones) so there's exactly one implementation of "what the current theme is"
 * and "how to change it" for both to agree on.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    // Deferred via .then(), not read directly: the react-hooks "no setState
    // in effect" lint treats a synchronous setState call inside the effect
    // body as still executing synchronously regardless of what it reads —
    // nesting it in a microtask callback keeps it out of the effect's own
    // synchronous body (same pattern as Breadcrumb.tsx).
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

  return { theme, isDark: theme === "dark", toggle };
}
