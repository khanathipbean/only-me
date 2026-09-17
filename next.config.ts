import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Normally `.next`. The end-to-end suite starts a second `next dev` on its
   * own port against its own database, and Next refuses to run two dev servers
   * out of one build directory — it holds a lock there. Giving that one its own
   * directory lets the suite run without anyone having to stop the dev server
   * they are working in. See `playwright.config.ts`.
   */
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
};

export default nextConfig;
