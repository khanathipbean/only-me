import { getProjectById } from "@/lib/projects";
import { auth } from "@/auth";
import { ALL_MEMBER_ROLES, requireProjectRoleOrNotFound } from "@/lib/rbac";
import { AUDIT_ACTIONS, listAuditLogForProject, parseUtcDateTimeLocal } from "@/lib/audit-log";
import { FilterForm } from "@/components/FilterForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pagination } from "@/components/ui/Pagination";
import { Select } from "@/components/ui/Select";
import {
  inputClass,
  labelClass,
  mutedTextClass,
  pageClass,
  tableClass,
  tableWrapClass,
  tdClass,
  thClass,
  trHoverClass,
} from "@/lib/ui";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProjectById(id);
  return { title: project ? `Audit Trail · ${project.name}` : "Audit Trail" };
}

export default async function AuditLogPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    /** Still accepted (and still exposed by the API route) so an exact-id
     * link keeps working, even though the filter UI searches by name. */
    actorId?: string;
    actorName?: string;
    action?: string;
    entityType?: string;
    from?: string;
    to?: string;
    page?: string;
    pageSize?: string;
  }>;
}) {
  const { id: projectId } = await params;
  const { actorId, actorName, action, entityType, from, to, page, pageSize } = await searchParams;
  const session = await auth();

  await requireProjectRoleOrNotFound(session!.user.id, projectId, ALL_MEMBER_ROLES);

  // `page`/`pageSize` are paging, not filtering, so clearing shouldn't be
  // offered for them alone.
  const hasFilters = Boolean(actorId || actorName || action || entityType || from || to);

  const result = await listAuditLogForProject(projectId, {
    actorId,
    actorName,
    action,
    entityType,
    from: parseUtcDateTimeLocal(from),
    to: parseUtcDateTimeLocal(to),
    page: page ? Number(page) : undefined,
    pageSize: pageSize ? Number(pageSize) : undefined,
  });

  return (
    <main className={pageClass}>
      <PageHeader title="Audit Trail" subtitle="All timestamps are shown in UTC." />

      <FilterForm showClear={hasFilters}>
        <label className={labelClass}>
          Actor User Name
          <input
            type="text"
            name="actorName"
            placeholder="Search by name"
            defaultValue={actorName}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Action
          <Select
            name="action"
            defaultValue={action ?? ""}
            options={[
              { value: "", label: "All" },
              ...AUDIT_ACTIONS.map((value) => ({ value, label: value })),
            ]}
            ariaLabel="Action"
            className="min-w-44"
          />
        </label>
        <label className={labelClass}>
          Entity Type
          <Select
            name="entityType"
            defaultValue={entityType ?? ""}
            options={[
              { value: "", label: "All" },
              { value: "Project", label: "Project" },
              { value: "Scenario", label: "Scenario" },
              { value: "TestGroup", label: "Test Group" },
              { value: "TestCase", label: "Test Case" },
            ]}
            ariaLabel="Entity Type"
            className="min-w-40"
          />
        </label>
        <label className={labelClass}>
          From
          <input type="datetime-local" name="from" defaultValue={from} className={inputClass} />
        </label>
        <label className={labelClass}>
          To
          <input type="datetime-local" name="to" defaultValue={to} className={inputClass} />
        </label>
      </FilterForm>

      {result.entries.length === 0 ? (
        <p className={mutedTextClass}>No matching audit log entries.</p>
      ) : (
        <div className={tableWrapClass}>
          <table className={tableClass}>
            <colgroup>
              <col className="w-[20%]" />
              <col className="w-[14%]" />
              <col className="w-[16%]" />
              <col className="w-[36%]" />
              <col className="w-[14%]" />
            </colgroup>
            <thead>
              <tr>
                <th className={thClass}>When (UTC)</th>
                <th className={thClass}>Actor</th>
                <th className={thClass}>Action</th>
                <th className={thClass}>Entity</th>
                <th className={thClass}>Change</th>
              </tr>
            </thead>
            <tbody>
              {result.entries.map((entry) => (
                <tr key={entry.id} className={trHoverClass}>
                  <td className={`${tdClass} whitespace-nowrap font-mono text-xs text-muted`}>
                    {entry.occurredAt.toISOString()}
                  </td>
                  <td className={tdClass}>{entry.actor.name}</td>
                  <td className={tdClass}>{entry.action}</td>
                  <td className={`${tdClass} text-muted`}>
                    {entry.entityType} ({entry.entityId})
                  </td>
                  <td className={tdClass}>
                    <details>
                      <summary className="cursor-pointer text-brand">Diff</summary>
                      <pre className="mt-2 max-w-md overflow-x-auto rounded-md bg-black/[.03] p-2 text-xs dark:bg-white/[.05]">
                        {JSON.stringify(
                          { old: entry.oldValue, new: entry.newValue },
                          null,
                          2,
                        )}
                      </pre>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        page={result.page}
        totalPages={result.totalPages}
        total={result.total}
        pageSize={result.pageSize}
      />
    </main>
  );
}
