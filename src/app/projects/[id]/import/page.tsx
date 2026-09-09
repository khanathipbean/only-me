import { auth } from "@/auth";
import { EDITOR_ROLES, requireProjectRoleOrNotFound } from "@/lib/rbac";
import { ImportWizard } from "@/components/ImportWizard";
import { PageHeader } from "@/components/ui/PageHeader";
import { pageClass } from "@/lib/ui";

export default async function ImportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;
  const session = await auth();

  await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);

  return (
    <main className={pageClass}>
      <PageHeader
        title="Import Scenarios / Test Groups / Test Cases"
        subtitle={
          <a href="/api/import/template" className="text-brand hover:underline">
            Download the import template
          </a>
        }
      />

      <ImportWizard projectId={projectId} />
    </main>
  );
}
