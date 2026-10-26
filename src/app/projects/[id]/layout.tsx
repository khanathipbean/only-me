import { ProjectTabs } from "@/components/ProjectTabs";
import { auth } from "@/auth";
import { getProjectMembership } from "@/lib/rbac";
import { heldBy } from "@/lib/permissions";

export default async function ProjectLayout({ children, params }: LayoutProps<"/projects/[id]">) {
  const { id } = await params;
  /* The menu is drawn from the role: a DEV may open five of the nine pages,
   * and offering the other four would be offering four 404s. Read here
   * rather than in the tabs themselves, which are client-side. */
  const session = await auth();
  const membership = session?.user?.id ? await getProjectMembership(session.user.id, id) : null;
  /* What this membership holds, worked out here because the tabs are a
   * client component and the rules sit beside a database connection. Every
   * capability rather than the ten the menu uses: the list is short, and a
   * subset here would be a second place to keep in step. */
  const allowed = await heldBy(membership?.role);

  return (
    <div className="flex flex-col">
      <div className="border-b border-border bg-surface px-6 sm:px-8 lg:px-12 xl:px-16">
        <ProjectTabs projectId={id} allowed={allowed} />
      </div>
      {children}
    </div>
  );
}
