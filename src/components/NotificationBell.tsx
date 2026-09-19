"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { IconButton } from "@/components/ui/Button";
import { BellIcon } from "@/components/icons";
import { NOTIFICATION_TYPE_STYLE } from "@/components/notificationStyle";
import { formatRelativeTime } from "@/lib/dates";
import { useDismissablePanel } from "@/lib/useDismissablePanel";
import type { NotificationType } from "@/generated/prisma/client";

type NotificationItem = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  occurredAt: string;
  readAt: string | null;
};

const POLL_MS = 30_000;

const tabClass = (active: boolean) =>
  `flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${
    active ? "bg-brand/10 text-brand" : "text-muted hover:bg-black/[.05] dark:hover:bg-white/[.08]"
  }`;

export function NotificationBell() {
  const router = useRouter();
  const { open, box, toggle, close, triggerRef, panelRef } = useDismissablePanel();
  const panelId = useId();
  const [tab, setTab] = useState<"all" | "unread">("all");
  const [unreadCount, setUnreadCount] = useState(0);
  /* Tagged with the tab it was fetched for, so a reply that lands after the
   * user has already switched tabs is simply ignored rather than shown under
   * the wrong tab — the same reasoning HeaderSearch tags results with the
   * query term they answer. */
  const [data, setData] = useState<{ tab: "all" | "unread"; items: NotificationItem[] } | null>(
    null,
  );
  const items = data && data.tab === tab ? data.items : null;

  // The badge stays live even while the panel is closed — a cheap count, so
  // polling it is fine. The full list only ever fetches when the panel opens.
  useEffect(() => {
    let cancelled = false;
    function poll() {
      fetch("/api/notifications/unread-count")
        .then((res) => (res.ok ? res.json() : null))
        .then((body) => {
          if (body && !cancelled) setUnreadCount(body.count);
        });
    }
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch(`/api/notifications?pageSize=20${tab === "unread" ? "&unread=1" : ""}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (body && !cancelled) setData({ tab, items: body.items });
      });
    return () => {
      cancelled = true;
    };
  }, [open, tab]);

  function markRead(id: string) {
    fetch(`/api/notifications/${id}/read`, { method: "POST" });
    setData((current) => {
      if (!current) return current;
      if (current.tab === "unread") {
        return { ...current, items: current.items.filter((item) => item.id !== id) };
      }
      return {
        ...current,
        items: current.items.map((item) =>
          item.id === id && !item.readAt ? { ...item, readAt: new Date().toISOString() } : item,
        ),
      };
    });
    setUnreadCount((count) => Math.max(0, count - 1));
  }

  function markAllRead() {
    fetch("/api/notifications/read-all", { method: "POST" });
    setData((current) => {
      if (!current) return current;
      if (current.tab === "unread") return { ...current, items: [] };
      const now = new Date().toISOString();
      return {
        ...current,
        items: current.items.map((item) => ({ ...item, readAt: item.readAt ?? now })),
      };
    });
    setUnreadCount(0);
  }

  function openItem(item: NotificationItem) {
    if (!item.readAt) markRead(item.id);
    close();
    if (item.link) router.push(item.link);
  }

  return (
    <div ref={triggerRef} className="relative">
      <IconButton
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label="Notifications"
        title="Notifications"
      >
        <BellIcon />
      </IconButton>
      {unreadCount > 0 && (
        <span className="pointer-events-none absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-background bg-red-500 px-1 font-mono text-[10px] font-semibold text-white">
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}

      {open &&
        box &&
        createPortal(
          <div
            id={panelId}
            ref={panelRef}
            role="menu"
            aria-label="Notifications"
            style={{ top: box.top, right: box.right }}
            className="fixed z-50 w-96 max-w-[calc(100vw-2.5rem)] overflow-hidden rounded-lg border border-border bg-surface text-left shadow-lg"
          >
            <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
              <p className="text-sm font-semibold text-foreground">Notifications</p>
              <button
                type="button"
                onClick={markAllRead}
                disabled={unreadCount === 0}
                className="text-xs font-semibold text-brand hover:text-brand-hover hover:underline disabled:pointer-events-none disabled:text-muted disabled:no-underline"
              >
                Mark all as read
              </button>
            </div>

            <div className="flex gap-1 px-3 pt-2.5">
              <button type="button" className={tabClass(tab === "all")} onClick={() => setTab("all")}>
                All
              </button>
              <button
                type="button"
                className={tabClass(tab === "unread")}
                onClick={() => setTab("unread")}
              >
                Unread
                {unreadCount > 0 && (
                  <span className="rounded-full bg-black/[.08] px-1.5 font-mono text-[10px] dark:bg-white/[.12]">
                    {unreadCount}
                  </span>
                )}
              </button>
            </div>

            <ul role="none" className="max-h-96 overflow-y-auto p-1.5">
              {items === null ? (
                <li className="px-3 py-8 text-center text-sm text-muted">Loading…</li>
              ) : items.length === 0 ? (
                <li className="flex flex-col items-center gap-2 px-3 py-10 text-center text-sm text-muted">
                  <BellIcon className="size-6 opacity-50" />
                  {tab === "unread" ? "No unread notifications." : "No notifications yet."}
                </li>
              ) : (
                items.map((item) => {
                  const { Icon, className } = NOTIFICATION_TYPE_STYLE[item.type];
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => openItem(item)}
                        className={`flex w-full items-start gap-2.5 rounded-md p-2.5 text-left hover:bg-black/[.05] dark:hover:bg-white/[.08] ${
                          item.readAt ? "opacity-60" : ""
                        }`}
                      >
                        <span
                          className={`flex size-8 shrink-0 items-center justify-center rounded-lg [&>svg]:size-4 ${className}`}
                        >
                          <Icon />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-2">
                            <span className="text-sm font-semibold text-foreground">{item.title}</span>
                            <span className="shrink-0 font-mono text-[11px] text-muted">
                              {formatRelativeTime(new Date(item.occurredAt))}
                            </span>
                          </span>
                          <span className="mt-0.5 block text-xs text-muted">{item.body}</span>
                        </span>
                        {!item.readAt && (
                          <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand" />
                        )}
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>,
          document.body,
        )}
    </div>
  );
}
