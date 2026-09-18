"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Badge, projectStatusTone } from "@/components/ui/Badge";
import { BoxIcon, CheckIcon, ChevronRightIcon, SettingsIcon } from "@/components/icons";

/** `/projects/<id>` and anything under it — the only pages where "which
 *  Project am I in" has an answer to show. */
const PROJECT_PATH = /^\/projects\/([^/]+)(\/.*)?$/;

/** Past this many, scanning stops working and the filter earns its place. */
const SEARCHABLE_FROM = 6;

export type PickerProject = {
  id: string;
  code: string;
  name: string;
  status: string;
};

/**
 * Switch between the Projects you're a member of without going back out to
 * the Projects list first.
 *
 * It lives in the global header, so it reads the current Project off the URL
 * rather than being told: the header is rendered above every page, including
 * the ones that have no Project at all, where this renders nothing.
 *
 * It keeps the tab you were on. Every Project has the same seven, so
 * Dashboard to Dashboard always resolves — but only for those seven exactly:
 * anything deeper is an id inside *this* Project (a Module, a run), which
 * means nothing in another one, so those land on the Project's Overview.
 *
 * Portalled and positioned from the trigger's box, like AccountMenu beside
 * it: the header is `sticky` with its own stacking context, so a panel
 * rendered inside it can end up clipped or behind the page.
 */
export function ProjectPicker({
  projects,
  canCreateProject,
}: {
  projects: PickerProject[];
  /** ADMIN on at least one Project. The same check that gates the Projects
   *  page's own "+ New Project", and the server action re-runs it — hiding
   *  the link here is tidiness, not the gate. */
  canCreateProject: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<{ top: number; right: number } | null>(null);
  const [query, setQuery] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const match = PROJECT_PATH.exec(pathname);
  const projectId = match?.[1];
  const rest = match?.[2] ?? "";
  const current = projects.find((project) => project.id === projectId);

  const searchable = projects.length >= SEARCHABLE_FROM;
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return projects;
    }
    return projects.filter(
      (project) =>
        project.name.toLowerCase().includes(needle) ||
        project.code.toLowerCase().includes(needle),
    );
  }, [projects, query]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (!wrapperRef.current?.contains(target) && !panelRef.current?.contains(target)) {
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

  // Nothing to show off a Project page, and nothing to choose with one
  // Project: a picker with a single option is a button that does nothing.
  if (!current || projects.length < 2) {
    return null;
  }

  function toggle() {
    if (open) {
      setOpen(false);
      setBox(null);
      return;
    }
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (!rect) return;
    /* Hung from the trigger's right edge, like AccountMenu beside it: the
       trigger sits in the right half of the header, so a panel starting at
       its left edge runs off the side of the window. The floor keeps a
       gutter there even if the trigger ever ends up hard against it. */
    setBox({ top: rect.bottom + 8, right: Math.max(12, window.innerWidth - rect.right) });
    setQuery("");
    setOpen(true);
  }

  function go(nextProjectId: string) {
    setOpen(false);
    if (nextProjectId === projectId) {
      return;
    }
    const isTab = rest === "" || /^\/[a-z-]+$/.test(rest);
    router.push(`/projects/${nextProjectId}${isTab ? rest : ""}`);
  }

  const footerClass =
    "flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-foreground hover:bg-black/[.05] dark:hover:bg-white/[.08] [&>svg:first-child]:size-4 [&>svg:first-child]:text-muted";

  return (
    <div ref={wrapperRef} className="relative hidden shrink-0 sm:block">
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label="Project"
        className="flex max-w-48 items-center gap-2 rounded-md border border-border bg-surface py-2 pr-2.5 pl-3 text-left text-sm text-foreground shadow-sm transition-colors outline-none hover:bg-black/[.02] focus-visible:border-brand focus-visible:ring-1 focus-visible:ring-brand dark:hover:bg-white/[.04]"
      >
        <BoxIcon className="size-4 shrink-0 text-muted" />
        <span className="truncate">{current.name}</span>
        <ChevronRightIcon className="size-3.5 shrink-0 rotate-90 text-muted" />
      </button>

      {open &&
        box &&
        createPortal(
          <div
            id={panelId}
            ref={panelRef}
            role="menu"
            style={{ top: box.top, right: box.right }}
            className="fixed z-50 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-border bg-surface text-left shadow-lg"
          >
            {searchable && (
              <div className="border-b border-border p-2">
                <input
                  autoFocus
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search projects…"
                  aria-label="Search projects"
                  className="block w-full rounded border border-border bg-surface px-2 py-1.5 text-sm text-foreground outline-none placeholder:text-muted focus-visible:border-brand"
                />
              </div>
            )}

            <div className="scrollbar-slim max-h-72 overflow-y-auto py-1">
              <p className="px-4 py-1.5 text-xs font-semibold tracking-wide text-muted uppercase">
                Projects
              </p>
              {shown.length === 0 ? (
                <p className="px-4 py-2 text-sm text-muted">No match</p>
              ) : (
                shown.map((project) => {
                  const isCurrent = project.id === projectId;
                  return (
                    <button
                      key={project.id}
                      type="button"
                      role="menuitem"
                      onClick={() => go(project.id)}
                      className={`flex w-full items-center gap-2.5 px-4 py-2 text-left hover:bg-black/[.05] dark:hover:bg-white/[.08] ${
                        isCurrent ? "bg-black/[.04] dark:bg-white/[.06]" : ""
                      }`}
                    >
                      {/* The code first and quiet, the name second and
                          legible: the code is how a Project is filed, the
                          name is what people call it. */}
                      <span className="w-20 shrink-0 truncate text-xs text-muted">
                        {project.code}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                        {project.name}
                      </span>
                      <Badge tone={projectStatusTone(project.status)}>{project.status}</Badge>
                      {/* Reserved whether or not it is ticked, so the badges
                          stay in one column down the list. */}
                      <span className="flex size-4 shrink-0 items-center justify-center text-brand">
                        {isCurrent && <CheckIcon className="size-3.5" />}
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            <div className="border-t border-border py-1">
              {canCreateProject && (
                <Link
                  role="menuitem"
                  href="/projects?new=1"
                  onClick={() => setOpen(false)}
                  className={footerClass}
                >
                  <BoxIcon />
                  <span className="flex-1">Create new project</span>
                  <ChevronRightIcon className="size-3.5 text-muted" />
                </Link>
              )}
              <Link
                role="menuitem"
                href="/projects"
                onClick={() => setOpen(false)}
                className={footerClass}
              >
                <SettingsIcon />
                <span className="flex-1">Manage projects</span>
                <ChevronRightIcon className="size-3.5 text-muted" />
              </Link>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
