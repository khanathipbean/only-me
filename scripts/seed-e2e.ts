import { hashPassword } from "@/lib/auth-credentials";
import { prisma } from "@/lib/prisma";
import { createScenario } from "@/lib/scenarios";
import { findOrCreateUnassignedRequirement } from "@/lib/requirements";
import { createTestGroup } from "@/lib/test-groups";
import { createTestCase, updateTestResultAndNotes } from "@/lib/test-cases";
import { addCasesToRun, createRun } from "@/lib/test-runs";
import { assignCase } from "@/lib/work";
import { WORK_DAYS_BY_PRIORITY, addWorkingDays } from "@/lib/deadlines";
import {
  MISSING_FILE_NAME,
  E2E_DEV_EMAIL,
  E2E_DEV_PASSWORD,
  E2E_EMAIL,
  E2E_ASSIGNED_CASE,
  E2E_OVERDUE_CASE,
  E2E_HANDOFF_CASE,
  E2E_HANDOFF_GROUP,
  E2E_HANDOFF_RUN,
  E2E_PASSWORD,
  E2E_VIEWER_EMAIL,
  E2E_VIEWER_PASSWORD,
} from "../e2e/support/credentials";

/**
 * The least this suite needs to be able to do anything at all.
 *
 * Creating a Project is gated on already being an ADMIN of some Project
 * (`isAdminAnywhere`), so a freshly pushed database is a dead end: no
 * projects means no memberships means nobody can make the first one through
 * the UI. One fixture project breaks that circle, and every test that needs a
 * project of its own then creates it the way a user would.
 *
 * Idempotent, so a run against a database that has been used before adds
 * nothing and changes nothing.
 *
 * Run as its own process by `e2e/global-setup.ts` rather than imported into
 * it: Playwright's loader does not apply the `@/*` path mapping, and `tsx` —
 * which this repo already seeds with — does.
 */
const FIXTURE_PROJECT_CODE = "E2E-FIXTURE";
const MISSING_FILE_KEY = "project-files/deliberately-absent";

export async function seedBaseline() {
  /* Nobody starts locked out. `db push` leaves the rows alone and this seed
   * is otherwise idempotent, so a login-limit test that stops halfway through
   * used to leave an account locked for the next fifteen minutes — which took
   * down the permission specs too, since they sign in as the same account and
   * have nothing to do with the limit. */
  await prisma.loginThrottle.deleteMany();

  const user =
    (await prisma.user.findUnique({ where: { email: E2E_EMAIL } })) ??
    (await prisma.user.create({
      data: {
        email: E2E_EMAIL,
        passwordHash: await hashPassword(E2E_PASSWORD),
        name: "E2E Admin",
      },
    }));

  const project =
    (await prisma.project.findUnique({ where: { code: FIXTURE_PROJECT_CODE } })) ??
    (await prisma.project.create({
      data: {
        code: FIXTURE_PROJECT_CODE,
        name: "E2E Fixture",
        description: "Created by the end-to-end suite. Safe to delete.",
        ownerId: user.id,
      },
    }));

  await prisma.projectMember.upsert({
    where: { projectId_userId: { projectId: project.id, userId: user.id } },
    update: { role: "ADMIN" },
    create: { projectId: project.id, userId: user.id, role: "ADMIN" },
  });

  // Someone the permission tests can be refused as: a member of the project,
  // so they can sign in and see it, but an ADMIN of nothing.
  const viewer =
    (await prisma.user.findUnique({ where: { email: E2E_VIEWER_EMAIL } })) ??
    (await prisma.user.create({
      data: {
        email: E2E_VIEWER_EMAIL,
        passwordHash: await hashPassword(E2E_VIEWER_PASSWORD),
        name: "E2E Viewer",
      },
    }));

  await prisma.projectMember.upsert({
    where: { projectId_userId: { projectId: project.id, userId: viewer.id } },
    update: { role: "VIEWER" },
    create: { projectId: project.id, userId: viewer.id, role: "VIEWER" },
  });

  /* Somebody to hand work to, and somebody for the role tests to be refused
   * as: a DEV reads what a VIEWER reads and writes one thing, so every page
   * it may not open needs an account that actually holds the role. */
  const dev =
    (await prisma.user.findUnique({ where: { email: E2E_DEV_EMAIL } })) ??
    (await prisma.user.create({
      data: {
        email: E2E_DEV_EMAIL,
        passwordHash: await hashPassword(E2E_DEV_PASSWORD),
        name: "E2E Dev",
      },
    }));

  await prisma.projectMember.upsert({
    where: { projectId_userId: { projectId: project.id, userId: dev.id } },
    update: { role: "DEV" },
    create: { projectId: project.id, userId: dev.id, role: "DEV" },
  });

  /* A round with two cases in it, so the specs that act on one do not each
   * have to build the five levels above a Test Case through the UI first.
   * Built with the same service functions the app uses, so the rows are the
   * rows the app would have made.
   *
   * Each piece is checked for separately rather than the whole block being
   * skipped once the round exists: a seed that adds a fixture later would
   * otherwise never reach a database that had already been seeded once, and
   * the specs needing it would fail with nothing to say why.
   */
  const existingGroup = await prisma.testGroup.findFirst({
    where: { name: E2E_HANDOFF_GROUP, scenario: { projectId: project.id } },
    select: { id: true },
  });
  let groupId = existingGroup?.id;
  if (!groupId) {
    const requirementId = await findOrCreateUnassignedRequirement(project.id, user.id);
    const scenario = await createScenario(
      project.id,
      {
        name: "Handing a failure over",
        requirementId,
        expectedResult: "The case can be handed to somebody",
        priority: "MEDIUM",
      },
      user.id,
    );
    groupId = (await createTestGroup(scenario.id, { name: E2E_HANDOFF_GROUP }, user.id)).id;
  }

  async function fixtureCase(name: string, make: () => Promise<{ id: string }>) {
    const existing = await prisma.testCase.findFirst({
      where: { name, testGroupId: groupId },
      select: { id: true },
    });
    return existing ?? (await make());
  }

  const toHandOver = await fixtureCase(E2E_HANDOFF_CASE, () =>
    createTestCase(
      groupId!,
      {
        name: E2E_HANDOFF_CASE,
        expectedResult: "ok",
        priority: "HIGH",
        steps: [{ step: "Open the round", expectedResult: "It opens" }],
      },
      user.id,
    ),
  );

  /* The second one arrives already handed over, with the failure that caused
   * it: a My Work page with nothing on it can only be tested for being
   * empty. */
  const handedOver = await fixtureCase(E2E_ASSIGNED_CASE, async () => {
    const made = await createTestCase(
      groupId!,
      {
        name: E2E_ASSIGNED_CASE,
        expectedResult: "The page opens",
        priority: "CRITICAL",
        steps: [{ step: "Open the page", expectedResult: "It opens" }],
      },
      user.id,
    );
    await updateTestResultAndNotes(
      made.id,
      { testResult: "FAILED", notes: "The page hangs on a spinner and never loads." },
      user.id,
    );
    await assignCase(made.id, dev.id, user.id, "Over to you — it never finishes loading.");
    return made;
  });

  /* A deadline for the one handed over, and a fresh one whenever the old has
   * gone by.
   *
   * Two reasons rather than one. Cases this fixture created before deadlines
   * existed carry none, which is correct for a real row and a poor fixture —
   * the ordinary card is the one with a date on it. And a date set on the day
   * the fixture was made is in the past by the end of the week, so the card
   * meant to show a repair still in time quietly became a second overdue one
   * and the test for "Day N of M" had nothing to find.
   *
   * A fixture that means something different depending on the day it is read
   * is not a fixture. */
  await prisma.testCase.updateMany({
    where: {
      id: handedOver.id,
      OR: [{ dueAt: null }, { dueAt: { lt: new Date() } }],
    },
    data: { dueAt: addWorkingDays(new Date(), WORK_DAYS_BY_PRIORITY.CRITICAL) },
  });

  /* The same again, but late. The deadline is pushed into the past by hand
   * because the only honest alternative is waiting a week. */
  const overdue = await fixtureCase(E2E_OVERDUE_CASE, async () => {
    const made = await createTestCase(
      groupId!,
      {
        name: E2E_OVERDUE_CASE,
        expectedResult: "The export finishes",
        priority: "HIGH",
        steps: [{ step: "Press Export", expectedResult: "A file is produced" }],
      },
      user.id,
    );
    await updateTestResultAndNotes(
      made.id,
      { testResult: "FAILED", notes: "Export stops at 40% every time." },
      user.id,
    );
    await assignCase(made.id, dev.id, user.id, "This one has been waiting a while.");
    return made;
  });
  await prisma.testCase.update({
    where: { id: overdue.id },
    data: { dueAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
  });

  const run =
    (await prisma.testRun.findUnique({
      where: { projectId_name: { projectId: project.id, name: E2E_HANDOFF_RUN } },
    })) ?? (await createRun(project.id, { name: E2E_HANDOFF_RUN }, user.id));
  // Adds only what is missing; a case already in the round is left alone.
  await addCasesToRun(run.id, [toHandOver.id, handedOver.id, overdue.id], user.id);

  /* A round answered several times over, so the history strip has something
   * to fold away. Written as rows rather than driven through
   * `setRunCaseResult`, which would close the hand-off the moment it recorded
   * a result — the point here is the shape of the history, not the loop. */
  const runCase = await prisma.testRunCase.findUniqueOrThrow({
    where: { testRunId_testCaseId: { testRunId: run.id, testCaseId: handedOver.id } },
    select: { id: true },
  });
  const answers = await prisma.testResultEvent.count({ where: { testRunCaseId: runCase.id } });
  if (answers === 0) {
    const script = [
      { testResult: "FAILED" as const, notes: "Hangs on the spinner." },
      { testResult: "NOT_RUN" as const, notes: null },
      { testResult: "FAILED" as const, notes: "Still hanging after the first fix." },
      { testResult: "BLOCKED" as const, notes: "Environment was down." },
      { testResult: "FAILED" as const, notes: "Back to hanging." },
    ];
    for (const answer of script) {
      await prisma.testResultEvent.create({
        data: {
          testCaseId: handedOver.id,
          testRunCaseId: runCase.id,
          testResult: answer.testResult,
          notes: answer.notes,
          recordedById: user.id,
        },
      });
    }
  }

  // A file row whose object was never in storage — the state the app is
  // actually in, where the storage key layout changed and old rows were left
  // pointing at nothing. Seeded rather than produced, because there is no way
  // to upload a file and then take its bytes away from outside.
  await prisma.projectFile.upsert({
    where: { storageKey: MISSING_FILE_KEY },
    update: {},
    create: {
      projectId: project.id,
      module: "Fixtures",
      fileName: MISSING_FILE_NAME,
      storageKey: MISSING_FILE_KEY,
      contentType: "application/pdf",
      size: 1234,
      uploadedById: user.id,
    },
  });

  return { user, viewer, dev, project };
}

async function main() {
  const { project } = await seedBaseline();
  console.log(`e2e baseline ready: project ${project.code}`);
  await prisma.$disconnect();
}

void main();
