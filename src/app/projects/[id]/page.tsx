import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getProjectMembership } from "@/lib/rbac";
import { can, requireCapabilityOrNotFound } from "@/lib/permissions";
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

  /* A DEV is sent on rather than refused.
   *
   * This address is where every link into a project points — the Projects
   * list, the picker in the header, every breadcrumb — so refusing it would
   * hand a DEV a 404 from each of them. One redirect here means no link
   * anywhere has to know about roles, which is the same move `/` made when it
   * learned to send people to `/projects`.
   *
   * Before the guard below, because the guard is what would refuse them. */
  const membership = await getProjectMembership(session!.user.id, id);
  if (membership?.role === "DEV") {
    redirect(`/projects/${id}/my-work`);
  }

  await requireCapabilityOrNotFound(session!.user.id, id, "reading.overview");

  const [project, modules] = await Promise.all([
    getProjectById(id),
    listModulesForProject(id),
  ]);
  if (!project) {
    redirect("/projects");
  }
  const hasModules = modules.length > 0;
  // Only fetched once there's something to summarize — an empty Project has
  // nothing for any of these queries to find.
  const summary = hasModules ? await getProjectOverviewSummary(id) : null;
  const canEdit = !!membership && can(membership.role, "project.edit");

  async function archive() {
    "use server";
    invalidateRouteCache();
    const session = await auth();
    await requireCapabilityOrNotFound(session!.user.id, id, "project.edit");
    await archiveProject(id, session!.user.id);
    redirect(withToast("/projects", "Project archived"));
  }

  async function restore() {
    "use server";
    invalidateRouteCache();
    const session = await auth();
    await requireCapabilityOrNotFound(session!.user.id, id, "project.edit");
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
