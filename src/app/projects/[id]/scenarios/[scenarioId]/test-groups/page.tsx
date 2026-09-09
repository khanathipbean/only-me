import Link from "next/link";
import { auth } from "@/auth";
import { ALL_MEMBER_ROLES, EDITOR_ROLES, requireProjectRoleOrNotFound } from "@/lib/rbac";
import { getScenarioById } from "@/lib/scenarios";
import { getProjectById } from "@/lib/projects";
import {
  ValidationError,
  createTestGroup,
  listTestGroupsForScenario,
  reorderTestGroups,
  updateTestGroup,
} from "@/lib/test-groups";
import { notFound, redirect } from "next/navigation";
import { Breadcrumb } from "@/components/Breadcrumb";
import { nameOr, testGroupsListBreadcrumb } from "@/lib/breadcrumb";
import { PageHeader } from "@/components/ui/PageHeader";
import { Modal } from "@/components/ui/Modal";
import { TestGroupForm } from "@/components/forms/TestGroupForm";
import { Badge, workflowStatusTone } from "@/components/ui/Badge";
import { IconLinkButton } from "@/components/ui/Button";
import { ChevronRightIcon, EditIcon } from "@/components/icons";
import {
  mutedTextClass,
  pageClass,
  tableClass,
  tableWrapClass,
  tdClass,
  thClass,
  trHoverClass,
} from "@/lib/ui";

export default async function TestGroupsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; scenarioId: string }>;
  searchParams: Promise<{
    error?: string;
    /** Which row's inline Edit modal to reopen after a failed save — without
     * it a validation error would reopen every row's modal at once. */
    editId?: string;
  }>;
}) {
  const { id: projectId, scenarioId } = await params;
  const { error, editId } = await searchParams;
  const session = await auth();

  const scenario = await getScenarioById(scenarioId);
  if (!scenario) {
    notFound();
  }

  await requireProjectRoleOrNotFound(session!.user.id, projectId, ALL_MEMBER_ROLES);

  const project = await getProjectById(projectId);
  const testGroups = await listTestGroupsForScenario(scenarioId);

  const listPath = `/projects/${projectId}/scenarios/${scenarioId}/test-groups`;

  /** Bound per row: an inline Edit modal on a list needs one action per Test
   * Group, unlike the detail page where a single closed-over id suffices. */
  function updateAction(testGroupId: string) {
    return async function update(formData: FormData) {
      "use server";

      const session = await auth();
      await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);

      try {
        await updateTestGroup(
          testGroupId,
          {
            name: formData.get("name") as string,
            description: (formData.get("description") as string) || null,
            testObjective: (formData.get("testObjective") as string) || null,
            status: formData.get("status") as never,
          },
          session!.user.id,
        );
      } catch (err) {
        if (err instanceof ValidationError) {
          redirect(
            `${listPath}?error=${encodeURIComponent(err.message)}&editId=${testGroupId}`,
          );
        }
        throw err;
      }

      redirect(listPath);
    };
  }

  async function create(formData: FormData) {
    "use server";

    const session = await auth();
    await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);

    let testGroup;
    try {
      testGroup = await createTestGroup(
        scenarioId,
        {
          name: formData.get("name") as string,
          description: (formData.get("description") as string) || null,
          testObjective: (formData.get("testObjective") as string) || null,
          status: formData.get("status") as never,
        },
        session!.user.id,
      );
    } catch (err) {
      if (err instanceof ValidationError) {
        redirect(
          `/projects/${projectId}/scenarios/${scenarioId}/test-groups?error=${encodeURIComponent(err.message)}`,
        );
      }
      throw err;
    }

    redirect(`/projects/${projectId}/scenarios/${scenarioId}/test-groups/${testGroup.id}`);
  }

  async function move(id: string, delta: -1 | 1) {
    "use server";
    const session = await auth();
    await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);

    const current = await listTestGroupsForScenario(scenarioId);
    const index = current.findIndex((tg) => tg.id === id);
    const swapWith = index + delta;
    if (index !== -1 && swapWith >= 0 && swapWith < current.length) {
      const orderedIds = current.map((tg) => tg.id);
      [orderedIds[index], orderedIds[swapWith]] = [orderedIds[swapWith], orderedIds[index]];
      await reorderTestGroups(scenarioId, orderedIds, session!.user.id);
    }
    redirect(`/projects/${projectId}/scenarios/${scenarioId}/test-groups`);
  }

  async function moveUp(formData: FormData) {
    "use server";
    await move(formData.get("id") as string, -1);
  }

  async function moveDown(formData: FormData) {
    "use server";
    await move(formData.get("id") as string, 1);
  }

  return (
    <main className={pageClass}>
      <Breadcrumb
        segments={testGroupsListBreadcrumb(
          { id: projectId, name: nameOr(project, projectId) },
          scenario,
        )}
      />
      <PageHeader
        title={`Test Groups for ${scenario.name}`}
        actions={
          <Modal
            triggerLabel="+ New Test Group"
            title="New Test Group"
            openOnMount={!!error && !editId}
          >
            <TestGroupForm
              action={create}
              submitLabel="Create Test Group"
              error={editId ? undefined : error}
            />
          </Modal>
        }
      />

      {testGroups.length === 0 ? (
        <p className={mutedTextClass}>No Test Groups yet. Create one to get started.</p>
      ) : (
        <div className={tableWrapClass}>
          <table className={tableClass}>
            <colgroup>
              <col className="w-[10%]" />
              <col className="w-[38%]" />
              <col className="w-[18%]" />
              <col className="w-[20%]" />
              <col className="w-[14%]" />
            </colgroup>
            <thead>
              <tr>
                <th className={thClass}>Sequence</th>
                <th className={thClass}>Name</th>
                <th className={thClass}>Status</th>
                <th className={thClass}>Reorder</th>
                <th className={`${thClass} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {testGroups.map((testGroup) => (
                <tr key={testGroup.id} className={trHoverClass}>
                  <td className={`${tdClass} text-muted`}>{testGroup.sequence}</td>
                  <td className={tdClass}>
                    {/* Straight to the children, not this Test Group's own
                        detail page: drilling down is the common move, and the
                        detail page is one click away via the arrow on the
                        right. */}
                    <Link
                      href={`${listPath}/${testGroup.id}/test-cases`}
                      className="font-medium text-foreground hover:text-brand hover:underline"
                    >
                      {testGroup.name}
                    </Link>
                  </td>
                  <td className={tdClass}>
                    <Badge tone={workflowStatusTone(testGroup.status)}>{testGroup.status}</Badge>
                  </td>
                  <td className={tdClass}>
                    <div className="flex items-center gap-1">
                      <form action={moveUp}>
                        <input type="hidden" name="id" value={testGroup.id} />
                        <button
                          type="submit"
                          className="rounded-md border border-border px-2 py-1 text-sm text-muted hover:text-foreground"
                        >
                          ↑
                        </button>
                      </form>
                      <form action={moveDown}>
                        <input type="hidden" name="id" value={testGroup.id} />
                        <button
                          type="submit"
                          className="rounded-md border border-border px-2 py-1 text-sm text-muted hover:text-foreground"
                        >
                          ↓
                        </button>
                      </form>
                    </div>
                  </td>
                  <td className={tdClass}>
                    <div className="flex items-center justify-end gap-1">
                      <Modal
                        triggerLabel="Edit"
                        triggerVariant="ghost"
                        triggerIcon={<EditIcon />}
                        title="Edit Test Group"
                        openOnMount={!!error && editId === testGroup.id}
                      >
                        <TestGroupForm
                          action={updateAction(testGroup.id)}
                          submitLabel="Save"
                          error={editId === testGroup.id ? error : undefined}
                          defaults={{
                            name: testGroup.name,
                            description: testGroup.description,
                            testObjective: testGroup.testObjective,
                            status: testGroup.status,
                          }}
                        />
                      </Modal>
                      <IconLinkButton
                        href={`${listPath}/${testGroup.id}`}
                        aria-label={`View details for ${testGroup.name}`}
                        title="View details"
                      >
                        <ChevronRightIcon />
                      </IconLinkButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
