import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { DuplicateCodeError, ValidationError, createProject } from "@/lib/projects";
import { Card } from "@/components/ui/Card";
import { ProjectForm } from "@/components/forms/ProjectForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { pageClass } from "@/lib/ui";

export const metadata = { title: "New Project" };

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  async function create(formData: FormData) {
    "use server";

    const session = await auth();
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

    redirect(`/projects/${project.id}`);
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
