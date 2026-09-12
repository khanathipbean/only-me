import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ALL_MEMBER_ROLES, EDITOR_ROLES, requireProjectRoleOrNotFound } from "@/lib/rbac";
import { getProjectById } from "@/lib/projects";
import {
  FileValidationError,
  MAX_FILE_BYTES,
  canPreview,
  deleteProjectFile,
  getProjectFile,
  listProjectFilesByModule,
  saveProjectFile,
} from "@/lib/project-files";
import { listModulesForProject } from "@/lib/modules";
import { ConfirmForm } from "@/components/ConfirmForm";
import { FilePreview } from "@/components/FilePreview";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button, IconButton } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { RequiredMark } from "@/components/forms/RequiredMark";
import { TrashIcon } from "@/components/icons";
import { labelClass, mutedTextClass, pageClass } from "@/lib/ui";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProjectById(id);
  return { title: project ? `Files · ${project.name}` : "Files" };
}

export default async function ProjectFilesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id: projectId } = await params;
  const { error } = await searchParams;
  const session = await auth();

  await requireProjectRoleOrNotFound(session!.user.id, projectId, ALL_MEMBER_ROLES);
  const [groups, modules] = await Promise.all([
    listProjectFilesByModule(projectId),
    listModulesForProject(projectId),
  ]);

  async function upload(formData: FormData) {
    "use server";
    const session = await auth();
    await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);

    const file = formData.get("file");
    if (!(file instanceof File)) {
      redirect(`/projects/${projectId}/files?error=${encodeURIComponent("Choose a file first")}`);
    }
    try {
      await saveProjectFile(
        projectId,
        formData.get("module") as string,
        file,
        session!.user.id,
      );
    } catch (err) {
      if (err instanceof FileValidationError) {
        redirect(`/projects/${projectId}/files?error=${encodeURIComponent(err.message)}`);
      }
      throw err;
    }
    redirect(`/projects/${projectId}/files`);
  }

  function removeAction(fileId: string) {
    return async function remove() {
      "use server";
      const session = await auth();
      await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);
      // Checked against this project so an id from elsewhere can't be deleted.
      const file = await getProjectFile(fileId);
      if (file && file.projectId === projectId) {
        await deleteProjectFile(fileId);
      }
      redirect(`/projects/${projectId}/files`);
    };
  }

  return (
    <main className={pageClass}>
      <PageHeader
        title="Files"
        subtitle="Documents kept against this project, grouped by module."
      />

      <Card className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-foreground">Add a file</h2>

        {error && (
          <p role="alert" className="rounded-md bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-900/40 dark:text-red-300">
            {error}
          </p>
        )}

        {/* No `encType`/`method`: React sets both itself for a server action,
            and specifying them makes it warn that it will override them. */}
        <form action={upload} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelClass}>
              <span>
                Module
                <RequiredMark />
              </span>
              <Select
                name="module"
                defaultValue=""
                required
                options={[
                  { value: "", label: "Choose a module…" },
                  ...modules.map((module) => ({ value: module.id, label: module.name })),
                ]}
                ariaLabel="Module"
              />
            </label>
            <label className={labelClass}>
              <span>
                File
                <RequiredMark />
              </span>
              <input
                type="file"
                name="file"
                required
                /* `border-transparent`, not no border at all: the outline is unwanted
                  but its 2px still count toward the height, and dropping them
                  would leave this field 36px against the 38px of every other
                  one on the row. Those 38 are py-2 (16) + a 20px line box +
                  2px border; here the inner button is the tallest thing at
                  file:py-1 (8) + 20 = 28, so py-1 (8) + 2 gets to the same
                  number. */
                className="block w-full rounded-md border border-transparent bg-surface py-1 pr-3 pl-1.5 text-sm text-muted file:mr-3 file:rounded-md file:border-0 file:bg-foreground file:px-3 file:py-1 file:text-sm file:font-medium file:text-background"
              />
            </label>
          </div>
          {/* Hint and button share a row: on their own lines the button left
              a full-width empty strip beneath the fields. */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className={mutedTextClass}>
              Up to {Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB. PDFs and images preview here;
              anything else downloads.
            </p>
            <Button type="submit">Upload</Button>
          </div>
        </form>
      </Card>

      {groups.length === 0 ? (
        <p className={mutedTextClass}>No files yet. Add one to get started.</p>
      ) : (
        groups.map((group) => (
          <section key={group.module} className="flex flex-col gap-3">
            <h2 className="border-b border-border pb-2 text-base font-semibold text-foreground">
              {group.module}
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.files.map((file) => (
                // min-w-0: a grid item defaults to min-width: auto, sized off
                // its content's min-content — an unbroken filename (no spaces
                // to wrap at) pushed that past the viewport on mobile, even
                // though the name inside is marked `truncate`.
                <li key={file.id} className="min-w-0">
                  <FilePreview
                    file={{
                      id: file.id,
                      fileName: file.fileName,
                      uploadedAt: file.uploadedAt.toISOString().slice(0, 10),
                      size: file.size,
                      href: `/api/projects/${projectId}/files/${file.id}`,
                      previewable: canPreview(file.contentType),
                      isImage: file.contentType.startsWith("image/"),
                    }}
                    deleteSlot={
                      <ConfirmForm
                        action={removeAction(file.id)}
                        confirmMessage={`Remove ${file.fileName} from this project?`}
                        variant="danger"
                      >
                        <IconButton
                          type="submit"
                          variant="ghost"
                          aria-label={`Remove ${file.fileName}`}
                          title="Remove"
                          className="text-muted hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
                        >
                          <TrashIcon />
                        </IconButton>
                      </ConfirmForm>
                    }
                  />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </main>
  );
}
