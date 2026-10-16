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

  /**
   * Headers every response carries. There were none, so a browser was left to
   * its own defaults on all of this.
   *
   * No Content-Security-Policy here, and not by oversight: the theme is set by
   * an inline script in the root layout, before React hydrates, so a useful
   * `script-src` needs a nonce and a nonce needs middleware. A CSP with
   * `'unsafe-inline'` would look like protection and provide almost none, which
   * is worse than the absence of one. Left as its own piece of work.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          /* SAMEORIGIN, not DENY. `FilePreview` draws PDFs in an `<iframe>`
           * pointed at this app's own file route, so DENY would break the
           * preview dialog — checked before choosing, not after. */
          { key: "X-Frame-Options", value: "SAMEORIGIN" },

          /* Matters most for uploaded files: the route that serves them
           * already sends this per response, and this makes it true of
           * everything, so bytes somebody uploaded can never be reinterpreted
           * as something the browser will execute. */
          { key: "X-Content-Type-Options", value: "nosniff" },

          /* Project and Test Case ids live in the path. Without this they
           * travel in the Referer header to any site somebody follows a link
           * to from inside the app. */
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },

          /* Nothing here uses any of them, and a page that asks for a camera
           * is a page doing something it was not built to do. */
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },

          /* Ignored over plain http, so this is inert on localhost and real on
           * Netlify, which already serves the site over https only. */
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
