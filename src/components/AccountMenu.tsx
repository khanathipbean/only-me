"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Avatar } from "@/components/ui/Avatar";
import { EditIcon, LogoutIcon } from "@/components/icons";

/**
 * The avatar in the header, and the menu it opens: who you are signed in as,
 * a way to edit that, and Logout.
 *
 * Portalled to `<body>` and positioned from the trigger's box for the same
 * reason the row menu is — the header is `sticky` with its own stacking
 * context, so a menu rendered inside it can end up clipped or underneath the
 * `logout` arrives as a prop: a server action is a serialisable reference, so
 * it can cross into a client component, which lets the menu own the button's
 * markup instead of accepting pre-styled children it has to work around.
 */
export function AccountMenu({
  name,
  email,
  logout,
}: {
  name: string;
  email: string;
  logout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<{ top: number; right: number } | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  function toggle() {
    if (open) {
      setOpen(false);
      setBox(null);
      return;
    }
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (!rect) return;
    setBox({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (!wrapperRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    // Fixed coordinates go stale as soon as anything moves.
    function onScrollOrResize() {
      setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open]);

  const itemClass =
    "flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm text-foreground hover:bg-black/[.05] dark:hover:bg-white/[.08] [&>svg]:size-4 [&>svg]:text-muted";

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label="Account menu"
        title={email}
        className="flex rounded-full ring-offset-2 ring-offset-background outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <Avatar name={name} title={email} />
      </button>

      {open &&
        box &&
        createPortal(
          <div
            id={menuId}
            ref={menuRef}
            role="menu"
            style={{ top: box.top, right: box.right }}
            className="fixed z-50 w-64 overflow-hidden rounded-lg border border-border bg-surface text-left shadow-lg"
          >
            <div className="border-b border-border px-4 py-3">
              <p className="truncate text-sm font-semibold text-foreground">{name}</p>
              <p className="truncate text-xs text-muted">{email}</p>
            </div>

            <div className="py-1">
              <Link role="menuitem" href="/profile" onClick={() => setOpen(false)} className={itemClass}>
                <EditIcon />
                Edit Profile
              </Link>
            </div>

            <div className="border-t border-border py-1">
              <form action={logout}>
                <button type="submit" role="menuitem" className={itemClass}>
                  <LogoutIcon />
                  Log out
                </button>
              </form>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
