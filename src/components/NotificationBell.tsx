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

/**
 * `fetch` rejects on a dropped connection rather than returning a response,
 * and none of the four calls below used to say what should happen then. The
 * polling one reran every thirty seconds, so one flaky minute left a rejection
 * in the console on a loop; the panel's one left it reading "Loading…" with
 * nothing on the way.
 *
 * Both answers below are "no" rather than a throw, so the caller decides what
 * to show — which is the part that was missing.
 */
async function getJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url);
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}

async function postOk(url: string): Promise<boolean> {
  try {
    return (await fetch(url, { method: "POST" })).ok;
  } catch {
    return false;
  }
}

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
  /* Two kinds of nothing, told apart: no `data` for this tab yet means the
   * answer is still coming, and `items: null` inside it means the answer was
   * that it could not be fetched. They used to be the same value, so a failed
   * fetch looked exactly like a slow one — forever. */
  const [data, setData] = useState<{
    tab: "all" | "unread";
    items: NotificationItem[] | null;
  } | null>(null);
  /** Bumped to ask for the list again, after a failure or a write that did
   *  not land. */
  const [reloads, setReloads] = useState(0);
  const loaded = data && data.tab === tab ? data : null;

  // The badge stays live even while the panel is closed — a cheap count, so
  // polling it is fine. The full list only ever fetches when the panel opens.
  useEffect(() => {
    let cancelled = false;
    async function poll() {
      const body = await getJson<{ count: number }>("/api/notifications/unread-count");
      // Keeps the last count it knew on a failure. Showing nought would say
      // "you are up to date", which is a different claim from "I could not
      // ask" and the one nobody would check again.
      if (body && !cancelled) setUnreadCount(body.count);
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
    (async () => {
      const body = await getJson<{ items: NotificationItem[] }>(
        `/api/notifications?pageSize=20${tab === "unread" ? "&unread=1" : ""}`,
      );
      if (!cancelled) setData({ tab, items: body ? body.items : null });
    })();
    return () => {
      cancelled = true;
    };
  }, [open, tab, reloads]);

  /* The writes below move the panel before the server has answered, which is
   * the right call for something this small — but only if a refusal is
   * noticed. Each one asks for the truth again if its request did not land,
   * rather than leaving the panel claiming something that never happened. */
  function markRead(id: string) {
    postOk(`/api/notifications/${id}/read`).then((ok) => {
      if (!ok) setReloads((n) => n + 1);
    });
    setData((current) => {
      if (!current || !current.items) return current;
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
    postOk("/api/notifications/read-all").then((ok) => {
      if (!ok) setReloads((n) => n + 1);
    });
    setData((current) => {
      if (!current || !current.items) return current;
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
              {loaded === null ? (
                <li className="px-3 py-8 text-center text-sm text-muted">Loading…</li>
              ) : loaded.items === null ? (
                /* Says so, and offers a way out. This state used to read
                   "Loading…" and never change. */
                <li className="flex flex-col items-center gap-2 px-3 py-10 text-center text-sm text-muted">
                  <BellIcon className="size-6 opacity-50" />
                  Couldn&apos;t load notifications.
                  <button
                    type="button"
                    onClick={() => setReloads((n) => n + 1)}
                    className="text-xs font-semibold text-brand hover:text-brand-hover hover:underline"
                  >
                    Try again
                  </button>
                </li>
              ) : loaded.items.length === 0 ? (
                <li className="flex flex-col items-center gap-2 px-3 py-10 text-center text-sm text-muted">
                  <BellIcon className="size-6 opacity-50" />
                  {tab === "unread" ? "No unread notifications." : "No notifications yet."}
                </li>
              ) : (
                loaded.items.map((item) => {
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
