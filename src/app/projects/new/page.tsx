import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { requireAdminAnywhereOrNotFound } from "@/lib/rbac";
import { DuplicateCodeError, ValidationError, createProject } from "@/lib/projects";
import { withToast } from "@/lib/toast";
import { Card } from "@/components/ui/Card";
import { ProjectForm } from "@/components/forms/ProjectForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { pageClass } from "@/lib/ui";
import { invalidateRouteCache } from "@/lib/revalidate";

export const metadata = { title: "New Project" };

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const session = await auth();

  /* Same rule the Modal on /projects enforces. This page is not linked from
   * anywhere — it is what that Modal replaced — but the URL still answers,
   * and without this any signed-in account, a VIEWER included, could create a
   * Project by typing it. */
  await requireAdminAnywhereOrNotFound(session!.user.id);

  async function create(formData: FormData) {
    "use server";
    invalidateRouteCache();

    // Checked again inside the action, not just above: a Server Action is its
    // own endpoint. Whether the page that renders the form refused to draw it
    // decides nothing about whether the action can be called.
    const session = await auth();
    await requireAdminAnywhereOrNotFound(session!.user.id);

    const startDate = formData.get("startDate") as string;
    const endDate = formData.get("endDate") as string;

    let project;
    try {
      project = await createProject(
        {
          code: formData.get("code") as string,
          name: formData.get("name") as string,
          description: (formData.get("description") as string) || null,
          status: formData.get("status") as never,
          startDate: startDate ? new Date(startDate) : null,
          endDate: endDate ? new Date(endDate) : null,
        },
        session!.user.id,
      );
    } catch (err) {
      if (err instanceof ValidationError || err instanceof DuplicateCodeError) {
        redirect(`/projects/new?error=${encodeURIComponent(err.message)}`);
      }
      throw err;
    }

    redirect(withToast(`/projects/${project.id}`, "Project created"));
  }

  return (
    <main className={pageClass}>
      <PageHeader title="New Project" />

      <Card className="max-w-4xl">
        <ProjectForm action={create} submitLabel="Create Project" error={error} />
      </Card>
    </main>
  );
}
