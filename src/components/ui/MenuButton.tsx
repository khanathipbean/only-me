"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * A button that opens a short menu beneath it.
 *
 * Built on `<details>`/`<summary>` rather than on state and a click handler,
 * because what it holds here is two download links: a menu made of buttons
 * and `useState` stops working the moment JavaScript does not, and the two
 * exports it replaced were plain `<a href>` that always worked. This way the
 * menu opens, the links work, and nothing is lost without JS — the script
 * below only adds the closing behaviour a browser does not give for free.
 *
 * Deliberately small. There are already five hand-rolled menus in this app
 * (the account menu, the project picker, the theme toggle, the notification
 * bell and a row's actions) and a sixth would be the fifth drift. This is
 * the one shape they could eventually share, so it lives in `ui/` rather
 * than beside the page that first needed it.
 */
export function MenuButton({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: ReactNode;
  /** The menu's items — plain links or form buttons. */
  children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const details = ref.current;
    if (!details) {
      return;
    }
    function close() {
      details!.open = false;
    }
    function onPointerDown(event: MouseEvent) {
      if (!details!.contains(event.target as Node)) {
        close();
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        close();
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    /* Choosing an item is the end of the menu's job: without this it stays
       open behind the download that just started. */
    details.addEventListener("click", (event) => {
      if ((event.target as HTMLElement).closest("a, button[type='submit']")) {
        close();
      }
    });
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <details ref={ref} className="relative">
      {/* `list-none` and the WebKit pseudo-element together: a `<summary>`
          draws a disclosure triangle by default, and the two engines hide it
          by different means. */}
      <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-black/[.03] [&::-webkit-details-marker]:hidden dark:hover:bg-white/[.05]">
        {icon}
        {label}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="size-3.5 text-muted"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <div className="absolute right-0 z-50 mt-1 w-44 overflow-hidden rounded-md border border-border bg-surface py-1 shadow-lg">
        {children}
      </div>
    </details>
  );
}

/** One line of a `MenuButton`, so the items cannot drift apart. */
export const menuItemClass =
  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-foreground hover:bg-black/[.05] dark:hover:bg-white/[.08] [&>svg]:size-4 [&>svg]:text-muted";
