import Link from "next/link";
import { auth } from "@/auth";
import { EDITOR_ROLES, requireProjectRoleOrNotFound } from "@/lib/rbac";
import { ImportWizard } from "@/components/ImportWizard";

export default async function ImportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;
  const session = await auth();

  await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);

  return (
    <main>
      <p>
        <Link href={`/projects/${projectId}`}>← Back to Project</Link>
      </p>
      <h1>Import Scenarios / Test Groups / Test Cases</h1>
      <p>
        <a href="/api/import/template">Download the import template</a>
      </p>
      <ImportWizard projectId={projectId} />
    </main>
  );
}
