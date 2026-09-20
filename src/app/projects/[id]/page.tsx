import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ALL_MEMBER_ROLES, EDITOR_ROLES, getProjectMembership, requireProjectRoleOrNotFound } from "@/lib/rbac";
import { archiveProject, getProjectById, restoreProject } from "@/lib/projects";
import { listModulesForProject } from "@/lib/modules";
import { getProjectOverviewSummary } from "@/lib/project-overview";
import { Breadcrumb } from "@/components/Breadcrumb";
import { projectBreadcrumb } from "@/lib/breadcrumb";
import { withToast } from "@/lib/toast";
import { ConfirmForm } from "@/components/ConfirmForm";
import { IconButton } from "@/components/ui/Button";
import { ClockIcon, SettingsIcon, TrashIcon } from "@/components/icons";
import { ProjectQuickActions } from "@/components/ProjectQuickActions";
import { ProjectOverviewSummary } from "@/components/ProjectOverviewSummary";
import { pageClass } from "@/lib/ui";
import { invalidateRouteCache } from "@/lib/revalidate";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProjectById(id);
  return { title: project?.name ?? "Project" };
}

export default async function ProjectOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();

  await requireProjectRoleOrNotFound(session!.user.id, id, ALL_MEMBER_ROLES);

  const [project, modules, membership] = await Promise.all([
    getProjectById(id),
    listModulesForProject(id),
    getProjectMembership(session!.user.id, id),
  ]);
  if (!project) {
    redirect("/projects");
  }
  const hasModules = modules.length > 0;
  // Only fetched once there's something to summarize — an empty Project has
  // nothing for any of these queries to find.
  const summary = hasModules ? await getProjectOverviewSummary(id) : null;
  const canEdit = !!membership && EDITOR_ROLES.includes(membership.role);

  async function archive() {
    "use server";
    invalidateRouteCache();
    const session = await auth();
    await requireProjectRoleOrNotFound(session!.user.id, id, EDITOR_ROLES);
    await archiveProject(id, session!.user.id);
    redirect(withToast("/projects", "Project archived"));
  }

  async function restore() {
    "use server";
    invalidateRouteCache();
    const session = await auth();
    await requireProjectRoleOrNotFound(session!.user.id, id, EDITOR_ROLES);
    await restoreProject(id, session!.user.id);
    redirect(withToast(`/projects/${id}`, "Project restored"));
  }

  const editHref = `/projects?edit=1&projectId=${id}`;
  const isArchived = Boolean(project.deletedAt);

  return (
    <main className={pageClass}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Breadcrumb segments={projectBreadcrumb(project)} />
        {summary && canEdit && (
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href={editHref}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-black/[.03] dark:hover:bg-white/[.05]"
            >
              <SettingsIcon className="size-4" />
              Project Settings
            </Link>
            {isArchived ? (
              <ConfirmForm action={restore} confirmMessage={`Restore ${project.name}?`}>
                <IconButton type="submit" aria-label="Restore project" title="Restore project">
                  <ClockIcon />
                </IconButton>
              </ConfirmForm>
            ) : (
              <ConfirmForm
                action={archive}
                confirmMessage={`Archive ${project.name}? It moves to the Archived filter on the Projects list.`}
                variant="danger"
              >
                <IconButton
                  type="submit"
                  variant="ghost"
                  aria-label="Archive project"
                  title="Archive project"
                  className="text-muted hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
                >
                  <TrashIcon />
                </IconButton>
              </ConfirmForm>
            )}
          </div>
        )}
      </div>
      {summary ? (
        <ProjectOverviewSummary project={project} summary={summary} />
      ) : (
        <ProjectQuickActions projectId={id} />
      )}
    </main>
  );
}
