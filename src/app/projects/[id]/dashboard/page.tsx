import { getProjectById } from "@/lib/projects";
import { auth } from "@/auth";
import { ALL_MEMBER_ROLES, requireProjectRoleOrNotFound } from "@/lib/rbac";
import { Breadcrumb } from "@/components/Breadcrumb";
import { dashboardBreadcrumb, nameOr } from "@/lib/breadcrumb";
import { DashboardView } from "@/components/DashboardView";
import { PageHeader } from "@/components/ui/PageHeader";
import { pageClass } from "@/lib/ui";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProjectById(id);
  return { title: project ? `Dashboard · ${project.name}` : "Dashboard" };
}

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;
  const session = await auth();

  await requireProjectRoleOrNotFound(session!.user.id, projectId, ALL_MEMBER_ROLES);
  const project = await getProjectById(projectId);

  return (
    <main className={pageClass}>
      <Breadcrumb
        segments={dashboardBreadcrumb({ id: projectId, name: nameOr(project, projectId) })}
      />
      <PageHeader
        title="Dashboard"
        actions={
          <a
            href={`/api/projects/${projectId}/dashboard/export`}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-black/[.03] dark:hover:bg-white/[.05]"
          >
            Export summary
          </a>
        }
      />
      <DashboardView projectId={projectId} />
    </main>
  );
}
