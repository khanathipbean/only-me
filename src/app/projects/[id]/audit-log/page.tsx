import { auth } from "@/auth";
import { ALL_MEMBER_ROLES, requireProjectRoleOrNotFound } from "@/lib/rbac";
import { listAuditLogForProject, parseUtcDateTimeLocal } from "@/lib/audit-log";
import { FilterForm } from "@/components/FilterForm";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  inputClass,
  labelClass,
  mutedTextClass,
  pageClass,
  selectClass,
  tableClass,
  tableWrapClass,
  tdClass,
  thClass,
  trHoverClass,
} from "@/lib/ui";

export default async function AuditLogPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    actorId?: string;
    action?: string;
    entityType?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
}) {
  const { id: projectId } = await params;
  const { actorId, action, entityType, from, to, page } = await searchParams;
  const session = await auth();

  await requireProjectRoleOrNotFound(session!.user.id, projectId, ALL_MEMBER_ROLES);

  const result = await listAuditLogForProject(projectId, {
    actorId,
    action,
    entityType,
    from: parseUtcDateTimeLocal(from),
    to: parseUtcDateTimeLocal(to),
    page: page ? Number(page) : undefined,
  });

  return (
    <main className={pageClass}>
      <PageHeader title="Audit Trail" subtitle="All timestamps are shown in UTC." />

      <FilterForm>
        <label className={labelClass}>
          Actor User ID
          <input type="text" name="actorId" defaultValue={actorId} className={inputClass} />
        </label>
        <label className={labelClass}>
          Action
          <input
            type="text"
            name="action"
            placeholder="create, update, move…"
            defaultValue={action}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Entity Type
          <select name="entityType" defaultValue={entityType ?? ""} className={`${selectClass} min-w-40`}>
            <option value="">All</option>
            <option value="Project">Project</option>
            <option value="Scenario">Scenario</option>
            <option value="TestGroup">Test Group</option>
            <option value="TestCase">Test Case</option>
          </select>
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

      <p className={mutedTextClass}>
        Page {result.page} of {result.totalPages} ({result.total} total)
      </p>
    </main>
  );
}
