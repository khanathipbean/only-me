import { getProjectById } from "@/lib/projects";
import { auth } from "@/auth";
import { ALL_MEMBER_ROLES, requireProjectRoleOrNotFound } from "@/lib/rbac";
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

  return (
    <main className={pageClass}>
      <PageHeader title="Dashboard" />
      <DashboardView projectId={projectId} />
    </main>
  );
}
