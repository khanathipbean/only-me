import { ProjectTabs } from "@/components/ProjectTabs";
import { auth } from "@/auth";
import { NON_DEV_ROLES, getProjectMembership } from "@/lib/rbac";

export default async function ProjectLayout({ children, params }: LayoutProps<"/projects/[id]">) {
  const { id } = await params;
  /* The menu is drawn from the role: a DEV may open five of the nine pages,
   * and offering the other four would be offering four 404s. Read here
   * rather than in the tabs themselves, which are client-side. */
  const session = await auth();
  const membership = session?.user?.id ? await getProjectMembership(session.user.id, id) : null;
  /* Four of the ten tabs are for the people running the testing, not the
   * people fixing what it finds. See `NON_DEV_ROLES`. */
  const readsEverything = membership !== null && NON_DEV_ROLES.includes(membership.role);

  return (
    <div className="flex flex-col">
      <div className="border-b border-border bg-surface px-6 sm:px-8 lg:px-12 xl:px-16">
        <ProjectTabs projectId={id} readsEverything={readsEverything} />
      </div>
      {children}
    </div>
  );
}
