import { getProjectById } from "@/lib/projects";
import { auth } from "@/auth";
import { EDITOR_ROLES, requireProjectRoleOrNotFound } from "@/lib/rbac";
import { Breadcrumb } from "@/components/Breadcrumb";
import { importBreadcrumb, nameOr } from "@/lib/breadcrumb";
import { ImportWizard } from "@/components/ImportWizard";
import { PageHeader } from "@/components/ui/PageHeader";
import { pageClass } from "@/lib/ui";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProjectById(id);
  return { title: project ? `Import · ${project.name}` : "Import" };
}

export default async function ImportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;
  const session = await auth();

  await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);
  const project = await getProjectById(projectId);

  return (
    <main className={pageClass}>
      <Breadcrumb
        segments={importBreadcrumb({ id: projectId, name: nameOr(project, projectId) })}
      />
      <PageHeader
        title="Import"
        subtitle={
          <span className="flex flex-col gap-1">
            {/* Naming all five levels in the title made it wrap; the sheet
                fills the whole hierarchy, so the title just says Import and
                the levels are spelled out here. */}
            <span>
              One sheet fills the whole hierarchy — Modules, Requirements, Scenarios, Test
              Groups and Test Cases. Existing rows are matched by name; the Module and
              Requirement columns may be left blank.
            </span>
            <a href="/api/import/template" className="text-brand hover:underline">
              Download the import template
            </a>
          </span>
        }
      />

      <ImportWizard projectId={projectId} />
    </main>
  );
}
