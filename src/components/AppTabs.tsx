"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The menu for everything that is not inside a Project.
 *
 * `ProjectTabs` has had a row of its own under the header since the start;
 * the pages outside a Project had nothing, and Members was reachable only
 * through an icon in the header that nobody finds without being told. This
 * is the same row for the other half of the app.
 *
 * `canManage` rather than the role itself, for the reason written on
 * `ProjectTabs`: this is a client component, and `@/lib/rbac` opens a
 * database connection — importing it here pulls `pg` into the browser bundle
 * and the build stops at "Can't resolve 'dns'". The layout holds the answer.
 *
 * And hiding is not the guard. `/settings` checks the role itself, the way
 * every page here does — this is so the menu tells the truth, not so the
 * page is safe.
 */
export function AppTabs({ canManage }: { canManage: boolean }) {
  const pathname = usePathname();

  /* Nothing inside a Project: that has its own row, and two rows of tabs
   * under one header is two menus arguing about where the reader is. Matched
   * on a Project *page* rather than on the prefix — `/projects` itself is the
   * list, which is exactly where this row belongs. */
  if (/^\/projects\/[^/]/.test(pathname)) {
    return null;
  }

  const tabs = [
    { label: "Projects", href: "/projects", shown: true },
    /* Last, and only for the people it will let in. Everything here is set
     * once for the whole install, which is not what anybody came to do. */
    { label: "Settings", href: "/settings", shown: canManage },
  ].filter((tab) => tab.shown);

  /* The row's own bar, not the layout's: returning null above has to take
     the border and the background with it, or a Project page gets an empty
     ruled strip under its header where this used to be. */
  return (
    <div className="border-b border-border bg-surface px-6 sm:px-8 lg:px-12 xl:px-16">
      <nav aria-label="Sections" className="flex min-w-0 gap-1 overflow-x-auto">
        {tabs.map((tab) => {
          /* Settings stays lit on the pages underneath it, so somebody three
           * clicks into Members can still see which section they are in. */
          const isActive =
            pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={isActive ? "page" : undefined}
              className={`shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "border-brand text-brand"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
