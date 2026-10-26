import { hashPassword } from "@/lib/auth-credentials";
import { prisma } from "@/lib/prisma";
import { createScenario } from "@/lib/scenarios";
import { createRequirement, findOrCreateUnassignedRequirement } from "@/lib/requirements";
import { createTestGroup } from "@/lib/test-groups";
import { createTestCase, updateTestResultAndNotes } from "@/lib/test-cases";
import { addCasesToRun, createRun } from "@/lib/test-runs";
import { assignCase, setWorkState } from "@/lib/work";
import { WORK_DAYS_BY_PRIORITY, addWorkingDays } from "@/lib/deadlines";
import {
  MISSING_FILE_NAME,
  E2E_DEV_EMAIL,
  E2E_DEV_PASSWORD,
  E2E_EMAIL,
  E2E_ASSIGNED_CASE,
  E2E_OVERDUE_CASE,
  E2E_FINISHED_CASE,
  E2E_HANDOFF_CASE,
  E2E_HANDOFF_GROUP,
  E2E_WIDE_CASE,
  E2E_WIDE_MODULE,
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

  /* Looked up across the project rather than inside one Test Group: one of
   * these lives under a chain of its own, and a check scoped to the usual
   * group never found it — so every run built another copy, and the page
   * that lists them started showing four of the same case. */
  async function fixtureCase(name: string, make: () => Promise<{ id: string }>) {
    const existing = await prisma.testCase.findFirst({
      where: { name, testGroup: { scenario: { projectId: project.id } } },
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

  /* One that went round the loop and came back green. Without it the
   * Finished tab has nothing in it, and a test that only ever sees the empty
   * state is a test of the empty state. */
  const fixed = await fixtureCase(E2E_FINISHED_CASE, async () => {
    /* Under a chain of its own, named the way the real ones are.
     *
     * The table that lists this row prints requirement, scenario and group
     * under the case name, and in use those run to four long Thai names —
     * which pushed the other three columns off the side of the page. The
     * fixture's own names are short English ones, so a test written against
     * them cannot tell a table that fits from one that does not. */
    const longScenario = await createScenario(
      project.id,
      {
        name: "SCN-DSD-001 เปิด Data Sharing Dashboard และเลือก Domain ที่ต้องการดูข้อมูล",
        requirementId: await findOrCreateUnassignedRequirement(project.id, user.id),
        expectedResult: "ระบบโหลดข้อมูลตาม Domain ที่เลือก",
        priority: "MEDIUM",
      },
      user.id,
    );
    const longGroup = await createTestGroup(
      longScenario.id,
      { name: "Domain Filter และการตรวจสอบข้อมูลทุกส่วนของหน้า" },
      user.id,
    );

    const made = await createTestCase(
      longGroup.id,
      {
        name: E2E_FINISHED_CASE,
        expectedResult: "The filter applies",
        priority: "MEDIUM",
        steps: [{ step: "Choose a filter", expectedResult: "The list narrows" }],
      },
      user.id,
    );
    await updateTestResultAndNotes(
      made.id,
      { testResult: "FAILED", notes: "The filter did nothing." },
      user.id,
    );
    await assignCase(made.id, dev.id, user.id, "Filter is ignored.");
    await setWorkState(made.id, "READY_TO_RETEST", dev.id, "Fixed the predicate.");
    // Retested green, which ends the hand-off and puts it on the Finished tab.
    await updateTestResultAndNotes(made.id, { testResult: "PASSED" }, user.id);
    return made;
  });

  const run =
    (await prisma.testRun.findUnique({
      where: { projectId_name: { projectId: project.id, name: E2E_HANDOFF_RUN } },
    })) ?? (await createRun(project.id, { name: E2E_HANDOFF_RUN }, user.id));
  // Adds only what is missing; a case already in the round is left alone.
  /* And sent round until it has been handed over three times, each with a
   * different claim that it was fixed.
   *
   * A case that goes round once proves the tab draws a row; a case that goes
   * round three times is what the panel under the row is for — three claims
   * that it was fixed, two of which did not hold. Topped up rather than
   * created in one go, so a database the suite has already run against ends
   * in the same place as a fresh one. */
  const attempts = await prisma.workEvent.findMany({
    where: { testCaseId: fixed.id, toState: "ASSIGNED" },
    select: { actorId: true, assigneeId: true },
  });
  let rounds = attempts.filter((move) => move.actorId !== move.assigneeId).length;
  /* Each round starts with its own failure, because the panel names the
   * failure that sent each hand-off out and a fixture whose rounds are
   * identical cannot tell one that names the right one from one that names
   * the newest. Recorded on the case rather than in the round, which is what
   * keeps this row's answer "outside a round" — the reading the Finished
   * tab's own test is written against. */
  while (rounds < 3) {
    rounds += 1;
    await updateTestResultAndNotes(
      fixed.id,
      { testResult: "FAILED", notes: `Round ${rounds}: the filter still ignores the Domain.` },
      user.id,
    );
    await assignCase(fixed.id, dev.id, user.id, `Round ${rounds}: over to you.`);
    await setWorkState(fixed.id, "READY_TO_RETEST", dev.id, `Round ${rounds}: fixed the filter.`);
    await updateTestResultAndNotes(fixed.id, { testResult: "PASSED" }, user.id);
  }

  /* A second Module in the round, named the way the real ones are.
   *
   * The round's own line names every Module it reaches, so a round drawing on
   * one short English name produces a header nothing can go wrong in — and
   * the thing that went wrong was a long one pushing the page's buttons off
   * their row. A fixture that cannot reproduce it cannot guard it. */
  const wideCase = await fixtureCase(E2E_WIDE_CASE, async () => {
    const wideModule = await prisma.module.upsert({
      where: { projectId_name: { projectId: project.id, name: E2E_WIDE_MODULE } },
      update: { deletedAt: null },
      create: { projectId: project.id, name: E2E_WIDE_MODULE, sequence: 99 },
    });
    const requirement = await createRequirement(
      project.id,
      {
        name: "REQ-CLASSIFICATION-001 ผู้ใช้สามารถเปิดหน้า ค้นหา และเลือก Classification ที่ต้องการได้",
        moduleId: wideModule.id,
        priority: "MEDIUM",
      },
      user.id,
    );
    const scenario = await createScenario(
      project.id,
      {
        name: "การเปิดหน้าและค้นหา Classification",
        requirementId: requirement.id,
        expectedResult: "หน้าเปิดได้และค้นหาได้",
        priority: "MEDIUM",
      },
      user.id,
    );
    const group = await createTestGroup(scenario.id, { name: "Navigation" }, user.id);
    return createTestCase(
      group.id,
      {
        name: E2E_WIDE_CASE,
        expectedResult: "เปิดหน้าได้",
        priority: "HIGH",
        steps: [{ step: "กดเมนู", expectedResult: "หน้าเปิด" }],
      },
      user.id,
    );
  });

  await addCasesToRun(
    run.id,
    [toHandOver.id, handedOver.id, overdue.id, wideCase.id],
    user.id,
  );

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
