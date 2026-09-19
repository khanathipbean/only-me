import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ALL_MEMBER_ROLES, EDITOR_ROLES, getProjectMembership, requireProjectRoleOrNotFound } from "@/lib/rbac";
import { getProjectById } from "@/lib/projects";
import { listModulesForProject } from "@/lib/modules";
import { getProjectOverviewSummary } from "@/lib/project-overview";
import { Breadcrumb } from "@/components/Breadcrumb";
import { projectBreadcrumb } from "@/lib/breadcrumb";
import { ProjectQuickActions } from "@/components/ProjectQuickActions";
import { ProjectOverviewSummary } from "@/components/ProjectOverviewSummary";
import { pageClass } from "@/lib/ui";

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

  return (
    <main className={pageClass}>
      <Breadcrumb segments={projectBreadcrumb(project)} />
      {summary ? (
        <ProjectOverviewSummary project={project} summary={summary} canEdit={canEdit} />
      ) : (
        <ProjectQuickActions projectId={id} />
      )}
    </main>
  );
}
