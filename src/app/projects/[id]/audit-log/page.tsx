import Link from "next/link";
import { auth } from "@/auth";
import { ALL_MEMBER_ROLES, requireProjectRoleOrNotFound } from "@/lib/rbac";
import { listAuditLogForProject, parseUtcDateTimeLocal } from "@/lib/audit-log";

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
    <main>
      <p>
        <Link href={`/projects/${projectId}`}>← Back to Project</Link>
      </p>
      <h1>Audit Trail</h1>
      <p>All timestamps are shown in UTC.</p>

      <form>
        <input type="text" name="actorId" placeholder="Actor User ID" defaultValue={actorId} />
        <input type="text" name="action" placeholder="Action (e.g. create, update, move)" defaultValue={action} />
        <select name="entityType" defaultValue={entityType ?? ""}>
          <option value="">All entity types</option>
          <option value="Project">Project</option>
          <option value="Scenario">Scenario</option>
          <option value="TestGroup">Test Group</option>
          <option value="TestCase">Test Case</option>
        </select>
        <label>
          From
          <input type="datetime-local" name="from" defaultValue={from} />
        </label>
        <label>
          To
          <input type="datetime-local" name="to" defaultValue={to} />
        </label>
        <button type="submit">Filter</button>
      </form>

      {result.entries.length === 0 ? (
        <p>No matching audit log entries.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>When (UTC)</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Entity</th>
              <th>Change</th>
            </tr>
          </thead>
          <tbody>
            {result.entries.map((entry) => (
              <tr key={entry.id}>
                <td>{entry.occurredAt.toISOString()}</td>
                <td>{entry.actor.name}</td>
                <td>{entry.action}</td>
                <td>
                  {entry.entityType} ({entry.entityId})
                </td>
                <td>
                  <details>
                    <summary>Diff</summary>
                    <pre>
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
      )}

      <p>
        Page {result.page} of {result.totalPages} ({result.total} total)
      </p>
    </main>
  );
}
