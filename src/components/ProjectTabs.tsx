"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import type { CapabilityKey } from "@/lib/permissions";
import type { MenuPreview as MenuPreviewPayload } from "@/lib/menu-preview-types";
import { MenuPreview, type PreviewKey } from "@/components/project/MenuPreview";
import { NavMenu, type NavMenuItem } from "@/components/ui/NavMenu";
import {
  BarChartIcon,
  ClipboardListIcon,
  FileIcon,
  HomeIcon,
  LinkIcon,
  PulseIcon,
  ShieldIcon,
} from "@/components/icons";

/**
 * `allowed` decides which tabs exist, because a DEV may open five of these
 * ten and would otherwise be shown four links to a 404.
 *
 * Capability names rather than the role itself: this is a client component,
 * and the rules live in `@/lib/rbac` beside functions that open a database
 * connection — importing them here pulled `pg` into the browser bundle and
 * the build stopped at "Can't resolve 'dns'". `CapabilityKey` is a type, so
 * it is erased at build time and carries nothing with it; the layout holds
 * the role and works the answers out.
 *
 * Each tab names the capability its own page checks, so the two cannot
 * disagree. They did: Import was shown to anybody who was not a DEV while
 * the page asked for an editor, so a VIEWER was offered a link to a 404.
 *
 * Hiding is not the guard. Every page below checks the role itself — hiding
 * a link a URL still reaches is the hole `/projects/new` once had, where the
 * button was gone and typing the address worked. This is so the menu tells
 * the truth, not so the pages are safe.
 */
export function ProjectTabs({
  projectId,
  allowed,
}: {
  projectId: string;
  allowed: readonly CapabilityKey[];
}) {
  const pathname = usePathname();
  const overviewHref = `/projects/${projectId}`;

  /*
   * What the menus draw beside their lists, fetched the first time one is
   * opened and never again.
   *
   * Not rendered into the layout with the tabs: that would put seven queries
   * on every page in the project, paid for by every reader whether or not
   * they ever open a menu — and the menu is a thing you pass through, not a
   * thing you look at. `asked` is a ref rather than state because it must be
   * true for the rest of this render, not after the next one: hovering
   * across three entries fires `onOpen` three times before any state the
   * first one set has landed.
   */
  const [preview, setPreview] = useState<MenuPreviewPayload | null>(null);
  const asked = useRef(false);

  const loadPreview = useCallback(() => {
    if (asked.current) {
      return;
    }
    asked.current = true;
    fetch(`/api/projects/${projectId}/menu-preview`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: MenuPreviewPayload | null) => {
        if (data) {
          setPreview(data);
        }
      })
      /* Silently. The menu is a working list of links without any of this,
         and an error about a drawing nobody asked for would be noise. */
      .catch(() => {});
  }, [projectId]);

  /*
   * Three groups, left to right: read, work, reach for.
   *
   * Overview and Dashboard are both places you go to look at numbers and
   * change nothing, and they used to sit either side of the two pages you
   * actually work in. Modules and Test Runs are the work — authoring the
   * tests and running them. Files, Import and Audit Trail are occasional:
   * Audit Trail last of all, since it is opened to settle a question about
   * who changed what rather than to get anything done.
   *
   * The order before this was not designed — Dashboard, Files and Import
   * arrived together in one commit and Test Runs was slotted in later, so
   * nothing had ever placed the seven against each other.
   */
  /**
   * A tab may stand for more than one page.
   *
   * Overview, Dashboard and Problem Cases were three tabs that all answered
   * the same kind of question — how are we doing — so they are one tab with
   * a switcher on the page now. They cannot be one entry with one capability
   * though: `reading.dashboard` is open to everybody while the other two are
   * not, so a DEV holds exactly one of the three. The tab therefore points
   * at the first view this reader can actually open; pointing it at the
   * Overview for a DEV would have sent them straight back out to My Work.
   */
  const everyTab: {
    label: string;
    views: readonly {
      href: string;
      needs: CapabilityKey;
      /** Named only where the entry stands for several pages: those open a
       *  menu, and a menu item with nothing but a name says no more than
       *  the pills it replaced. */
      label?: string;
      detail?: string;
      icon?: NavMenuItem["icon"];
      /** Which drawing the pane beside the menu shows for this view. */
      preview?: PreviewKey;
    }[];
  }[] = [
    {
      label: "Overview",
      views: [
        {
          href: overviewHref,
          needs: "reading.overview",
          label: "Summary",
          detail: "What this project holds, and what happened lately.",
          icon: HomeIcon,
          preview: "summary",
        },
        {
          href: `${overviewHref}/dashboard`,
          needs: "reading.dashboard",
          label: "Dashboard",
          detail: "How far each round has got, by result and priority.",
          icon: BarChartIcon,
          preview: "dashboard",
        },
        {
          href: `${overviewHref}/problem-cases`,
          needs: "reading.problems",
          label: "Problem Cases",
          detail: "Which cases keep going wrong, and in what shape.",
          icon: PulseIcon,
          preview: "problems",
        },
        /* Last of the four, and it was a tab of its own until it joined
           them: it is opened to settle a question about who changed what
           rather than to see how far along a round is, but that is still
           reading the project and changing nothing. */
        {
          href: `${overviewHref}/audit-log`,
          needs: "project.audit",
          label: "Audit Trail",
          detail: "Who changed what, and when.",
          icon: ShieldIcon,
          preview: "audit",
        },
      ],
    },
    /* After Overview, and first for a DEV — who has no Overview, so the
     * filter above leaves this at the front for them without the order
     * having to know about roles. Where a DEV lands and what they came for;
     * for everybody else, the part of the project's work that is in their
     * hands, which is worth a link even when it is usually empty. */
    { label: "My Work", views: [{ href: `${overviewHref}/my-work`, needs: "handoff.view" }] },
    /* "Test Cases", not "Modules": a Module is only the first of the five
       levels behind this tab, and naming the door after its doorstep said
       nothing about what the section is for. It also pairs with Test Runs
       beside it — what we test, and the rounds of running it — which the
       old name gave no hint of. The address stays /modules, which is what
       the page still lists. */
    { label: "Test Cases", views: [{ href: `${overviewHref}/modules`, needs: "authoring.view" }] },
    { label: "Test Runs", views: [{ href: `${overviewHref}/runs`, needs: "runs.view" }] },
    /* One tab for the three kinds of material this project keeps: what the
       team wrote down, the documents it holds, and links out to what lives
       elsewhere. Files used to sit beside this and is now a view inside it,
       reached by the switcher on the page — which is why `files.view` is
       not named here. The Files view checks it for itself, and the All view
       leaves file rows out for a reader who does not hold it. */
    {
      label: "Resources",
      views: [
        /* The All view is left off this menu rather than deleted: with each
           kind a line of its own, a fourth item for "the three together"
           reads as a fourth kind. Its page and its address still work, so
           bringing it back is this entry rather than a rewrite. */
        {
          href: `${overviewHref}/resources/notes`,
          needs: "notes.view",
          label: "Notes",
          detail: "What a meeting decided, and why something reads as it does.",
          icon: ClipboardListIcon,
          preview: "notes",
        },
        {
          href: `${overviewHref}/resources/files`,
          needs: "files.view",
          label: "Files",
          detail: "Documents kept against this project, grouped by module.",
          icon: FileIcon,
          preview: "files",
        },
        {
          href: `${overviewHref}/resources/links`,
          needs: "notes.view",
          label: "Links",
          detail: "Addresses for the things that live somewhere else.",
          icon: LinkIcon,
          preview: "links",
        },
      ],
    },
  ];

  /* Only the ones this membership can open — a link to a 404 is worse than
     no link at all — and each one aimed at the first of its views that is
     open to them. */
  const tabs = everyTab.flatMap((tab) => {
    const open = tab.views.filter((view) => allowed.includes(view.needs));
    return open.length === 0 ? [] : [{ label: tab.label, href: open[0].href, views: open }];
  });

  /* The same chrome whether the entry is a link or a menu trigger, so the
     bar reads as one row of tabs rather than two kinds of control. */
  const entryClass =
    "flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors";
  const restingClass = "border-transparent text-muted hover:text-foreground";
  const litClass = "border-brand text-brand";

  /** Where the reader is, for any of an entry's views. The project root is
   *  an exact match because every other address starts with it. */
  const isOn = (href: string) =>
    href === overviewHref ? pathname === overviewHref : pathname.startsWith(href);

  /* Which drawing belongs to which address. The menu hands back the item it
     is pointing at, and an address is what the two sides already share — so
     nothing new has to be threaded through `NavMenu`, which knows about
     menus and should not learn about this project's pages. */
  const sectionFor = new Map<string, PreviewKey>(
    everyTab.flatMap((tab) =>
      tab.views.flatMap((view) => (view.preview ? [[view.href, view.preview] as const] : [])),
    ),
  );

  return (
    <nav aria-label="Project" className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
      {tabs.map((tab) => {
        /* Any of the tab's views lights it, not only the one it points at:
           a DEV sent to the Dashboard must still see Overview marked, and so
           must anybody who switched to Problem Cases. */
        const isActive = tab.views.some((view) => isOn(view.href));

        /* One view left open to this reader is a link, however many the
           entry stands for: a menu holding a single item costs a hover and
           a click to do what one click already does. A DEV, who holds one
           of Overview's four, gets a plain link to it. */
        if (tab.views.length < 2) {
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={isActive ? "page" : undefined}
              className={`${entryClass} ${isActive ? litClass : restingClass}`}
            >
              {tab.label}
            </Link>
          );
        }

        return (
          <NavMenu
            key={tab.href}
            label={tab.label}
            active={isActive}
            className={`${entryClass} ${restingClass}`}
            activeClassName={litClass}
            onOpen={loadPreview}
            renderPreview={(item) => {
              const section = sectionFor.get(item.href);
              return section ? (
                <MenuPreview
                  section={section}
                  label={item.label}
                  data={preview}
                  loading={preview === null}
                />
              ) : null;
            }}
            items={tab.views.map((view) => ({
              label: view.label ?? tab.label,
              href: view.href,
              detail: view.detail ?? "",
              active: isOn(view.href),
              icon: view.icon,
            }))}
          />
        );
      })}
    </nav>
  );
}
