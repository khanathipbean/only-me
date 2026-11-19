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
  /**
   * Notes and Files used to be two tabs of their own. They are two views of
   * Resources now, and their old addresses are in people's bookmarks, in
   * chat and in whatever anyone pasted to a colleague — so they keep
   * working rather than becoming 404s.
   *
   * Here rather than in a stub page for each: a redirect declared this way
   * carries the query string with it, so `?fileId=…` and `?noteId=…` still
   * open the thing they name, and nothing has to be re-implemented to do it.
   * Permanent, because this is the address now and a browser may cache it.
   */
  async redirects() {
    return [
      { source: "/projects/:id/notes", destination: "/projects/:id/resources/notes", permanent: true },
      { source: "/projects/:id/notes/links", destination: "/projects/:id/resources/links", permanent: true },
      { source: "/projects/:id/files", destination: "/projects/:id/resources/files", permanent: true },
      /* Import was a tab of its own too. It fills the Modules list, so it is
       * an action on that page now rather than a destination beside it. */
      { source: "/projects/:id/import", destination: "/projects/:id/modules/import", permanent: true },
    ];
  },

  /**
   * Hash the build with Node's own crypto rather than webpack's WebAssembly
   * xxhash64.
   *
   * `next build --webpack` kept dying partway through with "Cannot read
   * properties of undefined (reading 'length')" inside
   * `WasmHash._updateWithBuffer` — three times in one afternoon, on a fresh
   * build directory as often as a stale one, which is what rules out the
   * cache. The reported cause is Node 24 (this machine runs v24.16.0):
   * the WebAssembly instance's memory buffer is detached between calls, so
   * the next `update` reads `.length` off nothing. It is intermittent, which
   * is why it looked like something else twice.
   *
   * Webpack is not optional here — Turbopack skips the proxy.js → middleware.js
   * rename that the Netlify runtime needs (see the `--webpack` flag in
   * package.json) — so the hash function is the part to change. `sha256` goes
   * through `node:crypto` and touches no WebAssembly at all. It costs a little
   * build time and changes the hashes in output filenames; nothing reads those
   * but the build itself.
   *
   * Remove this when the machine moves to a Node where the bug is gone.
   */
  webpack: (config) => {
    config.output = { ...config.output, hashFunction: "sha256" };
    return config;
  },

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
