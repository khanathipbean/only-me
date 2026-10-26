import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";
import { requireAdminAnywhereOrNotFound } from "@/lib/rbac";
import { Breadcrumb } from "@/components/Breadcrumb";
import { PageHeader } from "@/components/ui/PageHeader";
import { settingsBreadcrumb } from "@/lib/breadcrumb";
import { pageClass } from "@/lib/ui";
import { ShieldIcon, UsersIcon } from "@/components/icons";

export const metadata: Metadata = { title: "Settings" };

/**
 * Everything that is set once for the whole install rather than per Project.
 *
 * One card today and a grid built for more, which is the point: the things
 * that belong here — accounts, defaults, whatever the next one turns out to
 * be — have nowhere else to go, and were reachable only through an icon in
 * the header that nobody finds without being told.
 */
const SECTIONS = [
  {
    href: "/settings/members",
    icon: UsersIcon,
    title: "Users",
    description: "Who can sign in, and which Projects each of them can reach.",
  },
  {
    href: "/settings/roles",
    icon: ShieldIcon,
    title: "Roles & Permissions",
    description: "What each role can reach, in every Project.",
  },
];

export default async function SettingsPage() {
  const session = await auth();
  /* The menu hides the link from everybody else, and that is not the guard —
   * a hidden link is still a reachable address. The same check the Members
   * page makes, for the same reason. */
  await requireAdminAnywhereOrNotFound(session!.user.id);

  return (
    <main className={pageClass}>
      <Breadcrumb segments={settingsBreadcrumb()} />
      <PageHeader
        title="Settings"
        subtitle="Settings that apply across every Project, not to one of them."
      />

      {/* One column on a phone, two from tablet, three on a desk. The cards
          are the same width as each other at every step, so a section added
          later lands in the grid without anything being re-laid out. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map((section) => {
          const Icon = section.icon;
          return (
            /* The whole card is the link, not a word inside it: the card is
               the target the eye picks, and a link that is smaller than the
               thing it looks like is a click that misses. */
            <Link
              key={section.href}
              href={section.href}
              className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-5 shadow-sm transition-colors hover:border-brand focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <span className="flex items-center gap-2 text-foreground">
                <Icon className="size-5 text-muted" />
                <span className="font-medium">{section.title}</span>
              </span>
              <span className="text-sm text-muted">{section.description}</span>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
