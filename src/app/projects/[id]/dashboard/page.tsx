import Link from "next/link";
import { auth } from "@/auth";
import { ALL_MEMBER_ROLES, requireProjectRoleOrNotFound } from "@/lib/rbac";
import { DashboardView } from "@/components/DashboardView";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;
  const session = await auth();

  await requireProjectRoleOrNotFound(session!.user.id, projectId, ALL_MEMBER_ROLES);

  return (
    <main>
      <p>
        <Link href={`/projects/${projectId}`}>← Back to Project</Link>
      </p>
      <h1>Dashboard</h1>
      <DashboardView projectId={projectId} />
    </main>
  );
}
