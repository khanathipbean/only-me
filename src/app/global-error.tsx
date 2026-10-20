"use client";

/**
 * The last resort: this replaces the root layout, so it is what shows when
 * the layout itself throws — a failed session lookup, a missing environment
 * variable, anything that happens before a page is reached.
 *
 * It renders its own `<html>` and `<body>` because there is no layout left to
 * provide them, and it styles itself inline rather than through the theme
 * tokens: those come from the stylesheet and the theme-init script that live
 * in the layout that just failed, so relying on them here would risk white
 * text on a white page at the worst possible moment. `color-scheme` lets the
 * browser pick the ground, which is as much theming as this can honestly do.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="en">
      <body
        style={{
          colorScheme: "light dark",
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.75rem",
          padding: "2rem",
          textAlign: "center",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <h1 style={{ margin: 0, fontSize: "1.5rem" }}>Bull Terrier could not start</h1>
        <p style={{ margin: 0, maxWidth: "32rem", opacity: 0.7, fontSize: "0.875rem" }}>
          Something failed before the page could be built. Reloading may be enough; if it is not,
          the site is down rather than this page, and the reference below identifies it in the log.
        </p>
        {error.digest && (
          <p style={{ margin: 0, fontFamily: "ui-monospace, monospace", fontSize: "0.75rem", opacity: 0.6 }}>
            reference {error.digest}
          </p>
        )}
        {/* A plain reload, not `reset()` and not `<Link>`: whatever broke is
            above the router, so re-rendering the same tree — which is all a
            client-side navigation does — lands in the same place. A full page
            load is the point, which is why the rule is off for this line
            rather than the element changed. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/"
          style={{
            marginTop: "0.5rem",
            fontSize: "0.875rem",
            fontWeight: 600,
            textDecoration: "underline",
            color: "inherit",
          }}
        >
          Reload
        </a>
      </body>
    </html>
  );
}
