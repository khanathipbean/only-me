import { prisma } from "@/lib/prisma";
import type { Prisma, WorkflowStatus } from "@/generated/prisma/client";

/**
 * A parent's status, worked out from the children under it.
 *
 * The four levels that carry a `WorkflowStatus` — Requirement, Scenario, Test
 * Group, Test Case — each used to hold one nobody kept in step, so a
 * Requirement read IN_PROGRESS long after every case beneath it was finished.
 * Setting a Test Case now settles the three above it.
 *
 * `Module` is not in the chain: it has no status at all. Neither is
 * `TestCase.testResult`, which is a different question (how a round went)
 * settled by Test Runs, and stays out of this entirely.
 */
type Tx = Prisma.TransactionClient;

/** Where a level's children live, walking up. Each entry says how to find the
 *  children of a row at that level, and which row to recompute next. */
export type RollupLevel = "requirement" | "scenario" | "testGroup";

/**
 * Every live child the same status → that status. Anything else →
 * IN_PROGRESS.
 *
 * One sentence rather than a table, which is the point: four values give
 * sixteen pairs, and a rule with cases in it is one nobody can predict from
 * the outside.
 *
 * It reads "all COMPLETED → COMPLETED" and "all DRAFT → DRAFT" without
 * naming either. The rough edge it accepts is DRAFT mixed with READY, which
 * comes out IN_PROGRESS although nobody has started — the alternative is
 * special-casing, and an explainable rule is worth more than that case.
 *
 * `null` means "nothing to derive from": a row with no live children keeps
 * whatever it has, and keeps an editable Status field in the UI, because
 * there is nothing to compute and locking it would leave no way to say
 * anything about it at all.
 */
export function rollUpStatus(childStatuses: WorkflowStatus[]): WorkflowStatus | null {
  if (childStatuses.length === 0) {
    return null;
  }
  const first = childStatuses[0];
  return childStatuses.every((status) => status === first) ? first : "IN_PROGRESS";
}

/* Archived children are not counted. Both because a Test Group whose cases
 * were all put away would otherwise keep their status for ever, and because
 * archiving is how a parent whose last child is obsolete gets settled —
 * which is the answer this design gives instead of letting someone type over
 * the parent's status by hand. */
const LIVE = { deletedAt: null } as const;

async function childStatusesOf(tx: Tx, level: RollupLevel, id: string) {
  const rows =
    level === "requirement"
      ? await tx.scenario.findMany({ where: { requirementId: id, ...LIVE }, select: { status: true } })
      : level === "scenario"
        ? await tx.testGroup.findMany({ where: { scenarioId: id, ...LIVE }, select: { status: true } })
        : await tx.testCase.findMany({ where: { testGroupId: id, ...LIVE }, select: { status: true } });
  return rows.map((row) => row.status);
}

/** The row above this one, or null at the top of the chain. */
async function parentOf(
  tx: Tx,
  level: RollupLevel,
  id: string,
): Promise<{ level: RollupLevel; id: string } | null> {
  if (level === "requirement") {
    return null;
  }
  if (level === "scenario") {
    const row = await tx.scenario.findUnique({ where: { id }, select: { requirementId: true } });
    return row ? { level: "requirement", id: row.requirementId } : null;
  }
  const row = await tx.testGroup.findUnique({ where: { id }, select: { scenarioId: true } });
  return row ? { level: "scenario", id: row.scenarioId } : null;
}

async function writeStatus(tx: Tx, level: RollupLevel, id: string, status: WorkflowStatus) {
  if (level === "requirement") {
    await tx.requirement.update({ where: { id }, data: { status } });
  } else if (level === "scenario") {
    await tx.scenario.update({ where: { id }, data: { status } });
  } else {
    await tx.testGroup.update({ where: { id }, data: { status } });
  }
}

async function currentStatus(tx: Tx, level: RollupLevel, id: string) {
  const row =
    level === "requirement"
      ? await tx.requirement.findUnique({ where: { id }, select: { status: true } })
      : level === "scenario"
        ? await tx.scenario.findUnique({ where: { id }, select: { status: true } })
        : await tx.testGroup.findUnique({ where: { id }, select: { status: true } });
  return row?.status ?? null;
}

/**
 * Recompute one row from its children, then its parent, to the top.
 *
 * Takes the transaction so the caller's own write and everything this moves
 * commit together: a half-applied rollup is a tree that disagrees with
 * itself, and there is no way to notice one from the outside.
 *
 * A row already holding what its children say is not written again — that
 * keeps `updatedAt` honest, so an edit three levels down does not make every
 * level above it look edited.
 *
 * It does not stop the walk, though, and that distinction is the whole
 * point. An earlier version returned there, on the reasoning that a correct
 * row implies correct ancestors. It does not: rows written before any of
 * this existed are stale, and a Test Group that happens to agree with its
 * cases would have blocked the walk before it ever reached the Requirement
 * above it — which is precisely the row that needed fixing. Walking the
 * whole way is what lets the tree repair itself on the next edit beneath it.
 *
 * Three levels at most, so walking always costs a handful of queries.
 *
 * Call it with the row whose *children* changed. After moving a Test Case,
 * call it for the old Test Group as well as the new one — the level it left
 * has one fewer child and nothing else will notice.
 */
export async function rollUpFrom(tx: Tx, level: RollupLevel, id: string): Promise<void> {
  let at: { level: RollupLevel; id: string } | null = { level, id };

  while (at) {
    const next = rollUpStatus(await childStatusesOf(tx, at.level, at.id));
    if (next !== null && (await currentStatus(tx, at.level, at.id)) !== next) {
      await writeStatus(tx, at.level, at.id, next);
    }
    at = await parentOf(tx, at.level, at.id);
  }
}

/**
 * `rollUpFrom` for a caller that is not already inside a transaction.
 *
 * Prefer passing the caller's own `tx` where there is one: the write and the
 * rollup then commit together, and a crash between them cannot leave a parent
 * disagreeing with its children. This is for the paths that write through
 * helpers of their own — archive and restore go through `setDeletedAt`, which
 * owns its update — where threading a transaction through would mean
 * rewriting the helper for every level that uses it.
 *
 * The gap it leaves is small and self-healing: the next edit anywhere beneath
 * the parent recomputes it.
 */
export function rollUpAfter(level: RollupLevel, id: string) {
  return prisma.$transaction((tx) => rollUpFrom(tx, level, id));
}
