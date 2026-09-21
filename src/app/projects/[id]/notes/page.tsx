import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ALL_MEMBER_ROLES, EDITOR_ROLES, requireProjectRoleOrNotFound } from "@/lib/rbac";
import { getProjectById } from "@/lib/projects";
import { listModulesForProject } from "@/lib/modules";
import { listFeaturesForModule } from "@/lib/requirements";
import {
  NoteValidationError,
  archiveNote,
  createNote,
  listNotesForProjectPage,
  restoreNote,
  updateNote,
} from "@/lib/notes";
import { Breadcrumb } from "@/components/Breadcrumb";
import { DismissibleAlert } from "@/components/DismissibleAlert";
import { ConfirmForm } from "@/components/ConfirmForm";
import { FilterForm } from "@/components/FilterForm";
import { ResultCount } from "@/components/ui/ResultCount";
import { ExpandableRow } from "@/components/ui/ExpandableRow";
import { notesBreadcrumb, nameOr } from "@/lib/breadcrumb";
import { withToast } from "@/lib/toast";
import { formatDate, formatTimestamp } from "@/lib/dates";
import { PageHeader } from "@/components/ui/PageHeader";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { RequiredMark } from "@/components/forms/RequiredMark";
import { RowActions } from "@/components/ui/RowActions";
import { SubmitButton } from "@/components/SubmitButton";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { Select } from "@/components/ui/Select";
import { DialogCloseButton } from "@/components/ui/DialogCloseButton";
import { Badge } from "@/components/ui/Badge";
import { invalidateRouteCache } from "@/lib/revalidate";
import {
  inputClass,
  labelClass,
  mutedTextClass,
  pageClass,
  tableClass,
  tableWrapClass,
  tdClass,
  textareaClass,
  thCenterClass,
  thClass,
} from "@/lib/ui";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProjectById(id);
  return { title: project ? `Notes · ${project.name}` : "Notes" };
}

/** A `<input type="date">` value, or "" — the same shape the Test Runs form
 *  uses for its dates. */
function toDayValue(date: Date | null) {
  return date ? date.toISOString().slice(0, 10) : "";
}

/** Parsed back at UTC midnight: this field is a day, not a moment, and
 *  letting the server's own zone decide would shift it for half the world. */
function toDay(text: string | null) {
  if (!text) {
    return null;
  }
  const date = new Date(`${text}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export default async function NotesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    search?: string;
    moduleId?: string;
    feature?: string;
    archived?: string;
    page?: string;
    pageSize?: string;
    error?: string;
    editId?: string;
    /** Arrives from the Overview's Recent notes: the row it names starts
     *  expanded, so what someone clicked is open on the page they land on.
     *  Deliberately not part of `listQueryString` — it describes one
     *  arrival, not a filter to carry through every later action. */
    noteId?: string;
  }>;
}) {
  const { id: projectId } = await params;
  const { search, moduleId, feature, archived, page, pageSize, error, editId, noteId } =
    await searchParams;
  const session = await auth();

  await requireProjectRoleOrNotFound(session!.user.id, projectId, ALL_MEMBER_ROLES);

  const showArchived = archived === "1";
  const hasFilters = Boolean(search || moduleId || feature || showArchived);

  const [project, modules, result] = await Promise.all([
    getProjectById(projectId),
    listModulesForProject(projectId),
    listNotesForProjectPage(projectId, {
      search,
      moduleId,
      feature,
      archived: showArchived,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    }),
  ]);
  const notes = result.items;

  /* Features belong to a Module, so the suggestions and the filter only mean
   * anything once one is chosen. With "All modules" selected there is no
   * single set to offer, and a list pooled across Modules would suggest a
   * label that does not belong to the one being written against. */
  const features = moduleId ? await listFeaturesForModule(moduleId) : [];

  /* Plain strings only: a server action may close over serialisable values,
   * and capturing a helper function stops React encoding the action at all,
   * which leaves the form working only once JS has loaded. */
  const listQueryString = new URLSearchParams(
    Object.entries({ search, moduleId, feature, archived, page, pageSize }).filter(
      (entry): entry is [string, string] => Boolean(entry[1]),
    ),
  ).toString();
  const listPath = `/projects/${projectId}/notes`;
  const listHref = listQueryString ? `${listPath}?${listQueryString}` : listPath;

  const moduleOptions = modules.map((row) => ({ value: row.id, label: row.name }));

  async function create(formData: FormData) {
    "use server";
    invalidateRouteCache();
    const session = await auth();
    await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);
    try {
      await createNote(
        projectId,
        {
          moduleId: formData.get("moduleId") as string,
          feature: formData.get("feature") as string,
          title: formData.get("title") as string,
          body: (formData.get("body") as string) ?? "",
          occurredOn: toDay(formData.get("occurredOn") as string),
        },
        session!.user.id,
      );
    } catch (err) {
      if (err instanceof NoteValidationError) {
        const query = new URLSearchParams(listQueryString);
        query.set("error", err.message);
        redirect(`${listPath}?${query}`);
      }
      throw err;
    }
    redirect(withToast(listHref, "Note added"));
  }

  /** Bound per row: an inline Edit dialog needs one action per Note. */
  function rowActions(noteId: string) {
    return {
      async edit(formData: FormData) {
        "use server";
        invalidateRouteCache();
        const session = await auth();
        await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);
        try {
          await updateNote(
            noteId,
            {
              moduleId: formData.get("moduleId") as string,
              feature: formData.get("feature") as string,
              title: formData.get("title") as string,
              body: (formData.get("body") as string) ?? "",
              occurredOn: toDay(formData.get("occurredOn") as string),
            },
            session!.user.id,
          );
        } catch (err) {
          if (err instanceof NoteValidationError) {
            const query = new URLSearchParams(listQueryString);
            query.set("error", err.message);
            query.set("editId", noteId);
            redirect(`${listPath}?${query}`);
          }
          throw err;
        }
        redirect(withToast(listHref, "Note saved"));
      },
      async archive() {
        "use server";
        invalidateRouteCache();
        const session = await auth();
        await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);
        await archiveNote(noteId, session!.user.id);
        redirect(withToast(listHref, "Note archived"));
      },
      async restore() {
        "use server";
        invalidateRouteCache();
        const session = await auth();
        await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);
        await restoreNote(noteId, session!.user.id);
        redirect(withToast(listHref, "Note restored"));
      },
    };
  }

  /** The create and edit dialogs ask for the same four things. */
  function fields(defaults?: {
    moduleId: string;
    feature: string | null;
    title: string;
    body: string;
    occurredOn: Date | null;
  }) {
    return (
      <>
        <label className={labelClass}>
          <span>
            Module
            <RequiredMark />
          </span>
          <Select
            name="moduleId"
            required
            defaultValue={defaults?.moduleId ?? ""}
            options={[{ value: "", label: "Choose a module…" }, ...moduleOptions]}
            ariaLabel="Module"
          />
        </label>
        <label className={labelClass}>
          Feature
          {/* A suggestion list, not a closed set — the same control the
              Requirement form uses, and the same server-side re-spelling, so
              a Feature stays one group however it was typed. Suggestions
              come from the Module chosen in the filter above; a Module not
              being filtered on simply offers none. */}
          <input
            name="feature"
            defaultValue={defaults?.feature ?? ""}
            list="note-features"
            placeholder="Sub-area of the module, e.g. Policy Center"
            className={inputClass}
          />
          <datalist id="note-features">
            {features.map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
        </label>
        <label className={labelClass}>
          <span>
            Title
            <RequiredMark />
          </span>
          <input
            name="title"
            required
            defaultValue={defaults?.title}
            placeholder="e.g. Sprint 6 planning"
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Date
          <input
            type="date"
            name="occurredOn"
            defaultValue={toDayValue(defaults?.occurredOn ?? null)}
            className={inputClass}
          />
          <span className="text-xs font-normal text-muted">
            When it happened, if that differs from today. The list is ordered by this.
          </span>
        </label>
        <label className={labelClass}>
          Body
          <textarea
            name="body"
            rows={8}
            defaultValue={defaults?.body}
            placeholder="Plain text. Line breaks and your own bullets are kept as typed."
            className={textareaClass}
          />
          <span className="text-xs font-normal text-muted">
            Shown exactly as written — nothing is read as formatting.
          </span>
        </label>
      </>
    );
  }

  return (
    <main className={pageClass}>
      <Breadcrumb
        segments={notesBreadcrumb({ id: projectId, name: nameOr(project, projectId) })}
      />
      <PageHeader
        title="Notes"
        subtitle="What a meeting decided, why a Requirement reads the way it does — filed under a Module, visible to everyone on the Project."
        actions={
          modules.length === 0 ? null : (
            <Modal triggerLabel="+ New Note" title="New Note" openOnMount={!!error && !editId}>
              {error && !editId && (
                <p
                  role="alert"
                  className="mb-4 rounded-md bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-900/40 dark:text-red-300"
                >
                  {error}
                </p>
              )}
              <form action={create} className="flex flex-col gap-4">
                {fields()}
                <div className="mt-2 flex flex-wrap justify-end gap-2">
                  <DialogCloseButton />
                  <SubmitButton>Add note</SubmitButton>
                </div>
              </form>
            </Modal>
          )
        }
      />

      {error && !editId && <DismissibleAlert>{error}</DismissibleAlert>}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <FilterForm showClear={hasFilters} className="flex-1">
          <input
            type="text"
            name="search"
            placeholder="Search title and body"
            defaultValue={search}
            className={`${inputClass} max-w-xs`}
          />
          <label className={labelClass}>
            Module
            <Select
              name="moduleId"
              defaultValue={moduleId ?? ""}
              options={[{ value: "", label: "All modules" }, ...moduleOptions]}
              ariaLabel="Module"
              autoWidth
              className="max-w-52"
            />
          </label>
          {/* Only once a Module is chosen: a Feature belongs to one, so
              across all Modules there is no set of them to filter by. */}
          {features.length > 0 && (
            <label className={labelClass}>
              Feature
              <Select
                name="feature"
                defaultValue={feature ?? ""}
                options={[
                  { value: "", label: "All features" },
                  ...features.map((value) => ({ value, label: value })),
                ]}
                ariaLabel="Feature"
                autoWidth
                className="max-w-52"
              />
            </label>
          )}
          <label className={labelClass}>
            Show
            <Select
              name="archived"
              defaultValue={archived ?? ""}
              options={[
                { value: "", label: "Active" },
                { value: "1", label: "Archived" },
              ]}
              ariaLabel="Show"
              className="max-w-36"
            />
          </label>
        </FilterForm>
        <ResultCount total={result.total} />
      </div>

      {notes.length === 0 ? (
        <p className={mutedTextClass}>
          {modules.length === 0
            ? "Create a Module first — every note is filed under one."
            : showArchived
              ? "No archived notes."
              : hasFilters
                ? "No notes match your search."
                : "No notes yet. Write down what a meeting decided, or why a Requirement reads the way it does."}
        </p>
      ) : (
        <div className={tableWrapClass}>
          <table className={tableClass}>
            <colgroup>
              <col className="w-[44%]" />
              <col className="w-[16%]" />
              <col className="w-[14%]" />
              <col className="w-[18%]" />
              <col className="w-[8%]" />
            </colgroup>
            <thead>
              <tr>
                <th className={thClass}>Title</th>
                <th className={thClass}>Module</th>
                <th className={thClass}>Date</th>
                <th className={thClass}>Author</th>
                <th className={thCenterClass}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {notes.map((note) => {
                const actions = rowActions(note.id);
                return (
                  <ExpandableRow
                    key={note.id}
                    colSpan={5}
                    detailLabel={note.title}
                    openOnMount={noteId === note.id}
                    cells={
                      <>
                        <td className={tdClass}>
                          {/* The Feature beside the title, the Module in its
                              own column. The Module is a level — something
                              to scan and sort a column by — where the
                              Feature is only a label on this row, and reads
                              as one next to the thing it labels. Same split
                              the Requirements list makes. The title is the
                              only part that gives way, so the tag stays
                              beside it rather than at the far edge. */}
                          <div className="flex items-baseline gap-2">
                            <span className="min-w-0 font-medium text-foreground">
                              {note.title}
                            </span>
                            {note.feature && (
                              <span className="shrink-0">
                                <Badge tone="gray" variant="outline">
                                  {note.feature}
                                </Badge>
                              </span>
                            )}
                          </div>
                        </td>
                        <td className={tdClass}>
                          <Badge tone="indigo">{note.module.name}</Badge>
                        </td>
                        <td className={`${tdClass} text-muted`}>
                          {note.occurredOn ? formatDate(note.occurredOn) : "—"}
                        </td>
                        <td className={`${tdClass} truncate text-muted`}>
                          {note.createdBy.name ?? note.createdBy.email}
                        </td>
                      </>
                    }
                    detail={
                      <div className="flex flex-col gap-3">
                        {/* `whitespace-pre-wrap`, never a Markdown renderer:
                            the body is shown exactly as it was typed, which
                            is also what keeps a `<script>` someone pasted
                            from ever becoming one. */}
                        <p className="max-w-[80ch] text-sm whitespace-pre-wrap text-foreground">
                          {note.body || <span className="text-muted">No body.</span>}
                        </p>
                        <p className="text-xs text-muted">
                          Last edited {formatTimestamp(note.updatedAt)}
                        </p>
                      </div>
                    }
                    actions={
                      <RowActions
                        /* `updatedAt` in the key so a successful save
                           remounts this: the dialog's open/closed state
                           lives in the client component, and without a key
                           change it survives the redirect and sits there
                           open over a row that has already updated behind
                           it. A failed save changes nothing but `editId`,
                           which reopens it with the error instead. */
                        key={`${note.id}-${note.updatedAt.getTime()}-${editId === note.id}`}
                        label={note.title}
                        title="Edit Note"
                        openOnMount={!!error && editId === note.id}
                      >
                        {error && editId === note.id && (
                          <p
                            role="alert"
                            className="mb-4 rounded-md bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-900/40 dark:text-red-300"
                          >
                            {error}
                          </p>
                        )}
                        <form
                          id={`edit-note-${note.id}`}
                          action={actions.edit}
                          className="flex flex-col gap-4"
                        >
                          {fields({
                            moduleId: note.moduleId,
                            feature: note.feature,
                            title: note.title,
                            body: note.body,
                            occurredOn: note.occurredOn,
                          })}
                        </form>
                        <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-5">
                          {showArchived ? (
                            <ConfirmForm action={actions.restore} confirmMessage="Restore this note?">
                              <SubmitButton variant="secondary" pendingLabel="Restoring…">
                                Restore
                              </SubmitButton>
                            </ConfirmForm>
                          ) : (
                            <ConfirmForm action={actions.archive} confirmMessage="Archive this note?">
                              <SubmitButton variant="secondary" pendingLabel="Archiving…">
                                Archive
                              </SubmitButton>
                            </ConfirmForm>
                          )}
                          <div className="flex items-center gap-2">
                            <DialogCloseButton />
                            <FormSubmitButton formId={`edit-note-${note.id}`}>
                              Save
                            </FormSubmitButton>
                          </div>
                        </div>
                      </RowActions>
                    }
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
        totalPages={result.totalPages}
      />
    </main>
  );
}
