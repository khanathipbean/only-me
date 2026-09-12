"use client";

import { IconButton } from "@/components/ui/Button";
import { MoonIcon, SunIcon } from "@/components/icons";
import { useTheme } from "@/lib/theme";

/**
 * Manual override for the OS-level `prefers-color-scheme`. Persisted to
 * localStorage and applied via `data-theme` on <html> (see globals.css) — the
 * blocking inline script in layout.tsx applies any stored preference before
 * paint, so this component's own first client render (state still null,
 * matching its SSR output) never causes a visible flash.
 */
export function ThemeToggle() {
  const { isDark, toggle } = useTheme();

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
