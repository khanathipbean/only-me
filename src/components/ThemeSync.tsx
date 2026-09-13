"use client";

import { useEffect } from "react";
import { applyStoredOrSystemTheme } from "@/lib/theme";

/**
 * Mounted unconditionally in the root layout (unlike ThemeToggle, which only
 * exists once signed in) so every page — including /login — gets a second,
 * effect-driven pass at setting data-theme. Needed because the blocking
 * inline script in layout.tsx can lose this race: on a slow connection, a
 * hydration mismatch elsewhere in the tree makes React discard and
 * regenerate it from scratch, wiping the attribute the script set moments
 * earlier. This runs after that settles, so it always wins last.
 */
export function ThemeSync() {
  useEffect(() => {
    applyStoredOrSystemTheme();
  }, []);

  return null;
}
