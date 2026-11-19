import { getProjectById } from "@/lib/projects";
import { auth } from "@/auth";
import { can, requireCapabilityOrNotFound } from "@/lib/permissions";
import { Breadcrumb } from "@/components/Breadcrumb";
import { OverviewTabs } from "../OverviewTabs";
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

  const membership = await requireCapabilityOrNotFound(
    session!.user.id,
    projectId,
    "reading.dashboard",
  );
  const project = await getProjectById(projectId);
  /* Only to decide which pills the switcher offers. Each page checks for
     itself; hiding a link has never been the guard here. */
  const [canSeeOverview, canSeeProblems, canSeeAudit] = await Promise.all([
    can(membership.role, "reading.overview"),
    can(membership.role, "reading.problems"),
    can(membership.role, "project.audit"),
  ]);

  return (
    <main className={pageClass}>
      <Breadcrumb
        segments={dashboardBreadcrumb({ id: projectId, name: nameOr(project, projectId) })}
      />

      {/* Above the title and at the left edge: this control changes which
          page you are on, so it leads the page rather than trailing its
          name. On the breadcrumb line it sat far from the title it governs
          and wrapped under the crumbs on a narrow screen. */}
      <OverviewTabs
        projectId={projectId}
        active="dashboard"
        canSeeOverview={canSeeOverview}
        canSeeDashboard
        canSeeProblems={canSeeProblems}
        canSeeAudit={canSeeAudit}
      />

      <PageHeader
        title="Dashboard"
        subtitle="How far each round has got — results, priorities and the progress of every test run in this project."
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
