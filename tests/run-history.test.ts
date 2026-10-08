import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createModule } from "@/lib/modules";
import { createRequirement } from "@/lib/requirements";
import { createScenario } from "@/lib/scenarios";
import { createTestGroup } from "@/lib/test-groups";
import {
  createTestCase,
  listTestCasesWithStepsForTestGroupPage,
  updateTestResultAndNotes,
} from "@/lib/test-cases";
import { addCasesToRun, createRun, setRunCaseResult } from "@/lib/test-runs";
import {
  brokeAt,
  classifyPattern,
  listProblemCases,
  failureCount,
  listRunHistoryForCases,
  summariseHistory,
  toResultMarks,
  type RunHistoryEntry,
} from "@/lib/run-history";
import type { TestResult } from "@/generated/prisma/client";

async function seed(code: string) {
  const owner = await prisma.user.create({
    data: { email: `${code.toLowerCase()}@example.com`, passwordHash: "x", name: code },
  });
  const project = await prisma.project.create({
    data: { code, name: code, status: "ACTIVE", ownerId: owner.id },
  });
  const mod = await createModule(project.id, "Policy", owner.id);
  const requirement = await createRequirement(
    project.id,
    { moduleId: mod.id, name: `Req ${code}`, priority: "MEDIUM", feature: "Usage Document" },
    owner.id,
  );
  const scenario = await createScenario(
    project.id,
    { requirementId: requirement.id, name: `Sc ${code}`, expectedResult: "ok", priority: "MEDIUM" },
    owner.id,
  );
  const group = await createTestGroup(scenario.id, { name: `Grp ${code}` }, owner.id);
  const testCase = await createTestCase(
    group.id,
    {
      name: `Case ${code}`,
      expectedResult: "ok",
      priority: "MEDIUM",
      steps: [{ step: "s", expectedResult: "r" }],
    },
    owner.id,
  );
  return { owner, project, group, testCase };
}

describe("a Test Case's run history", () => {
  it("reads oldest round first, with what was written down when it failed", async () => {
    const { owner, project, testCase } = await seed("PRJ-HIST-1");

    /* Created in order, because rounds are ordered by `createdAt` — the only
     * ordering every round has, since `startsOn` is optional. */
    const first = await createRun(project.id, { name: "Sprint 1" }, owner.id);
    const second = await createRun(project.id, { name: "Sprint 2", phase: "Phase 1.2" }, owner.id);
    const third = await createRun(project.id, { name: "Sprint 3" }, owner.id);

    for (const run of [first, second, third]) {
      await addCasesToRun(run.id, [testCase.id], owner.id);
    }
    await setRunCaseResult(first.id, testCase.id, { testResult: "PASSED" }, owner.id);
    await setRunCaseResult(
      second.id,
      testCase.id,
      { testResult: "FAILED", notes: "Domain did not appear" },
      owner.id,
    );
    // Third is left alone: in the round, never recorded.

    const history = (await listRunHistoryForCases([testCase.id])).get(testCase.id) ?? [];

    /* Oldest first is what makes a pattern legible: "passed, failed" is a
     * different story from "failed, passed" even though the counts match. */
    expect(history.map((entry) => entry.runName)).toEqual(["Sprint 1", "Sprint 2", "Sprint 3"]);
    expect(history.map((entry) => entry.testResult)).toEqual(["PASSED", "FAILED", "NOT_RUN"]);

    expect(history[1]).toMatchObject({ phase: "Phase 1.2", notes: "Domain did not appear" });
    expect(history[1].ranBy).toBe("PRJ-HIST-1");
    expect(history[1].ranAt).toBeInstanceOf(Date);

    // In the round and never recorded, which is not "not reached yet".
    expect(history[2].ranAt).toBeNull();

    expect(summariseHistory(history)).toEqual({ rounds: 3, ran: 2, failed: 1, hadFailure: 1 });
  });

  it("leaves out archived rounds, which still own their rows", async () => {
    const { owner, project, testCase } = await seed("PRJ-HIST-2");

    const live = await createRun(project.id, { name: "Live" }, owner.id);
    const archived = await createRun(project.id, { name: "Archived" }, owner.id);
    await addCasesToRun(live.id, [testCase.id], owner.id);
    await addCasesToRun(archived.id, [testCase.id], owner.id);
    await setRunCaseResult(archived.id, testCase.id, { testResult: "FAILED" }, owner.id);

    await prisma.testRun.update({ where: { id: archived.id }, data: { deletedAt: new Date() } });

    const history = (await listRunHistoryForCases([testCase.id])).get(testCase.id) ?? [];

    /* The Dashboard was bitten by exactly this: archiving a round leaves its
     * TestRunCase rows behind, and counting them had 142 cases reading as
     * "scheduled" while the rounds on screen covered 21. A history that
     * counted a round nobody can open would mislead the same way — and the
     * failure it carried would be blamed on a round that no longer exists. */
    expect(history.map((entry) => entry.runName)).toEqual(["Live"]);
    expect(summariseHistory(history)).toEqual({ rounds: 1, ran: 0, failed: 0, hadFailure: 0 });
  });

  it("answers for many cases in one go, and says nothing for one with no rounds", async () => {
    const { owner, project, testCase } = await seed("PRJ-HIST-3");
    const untouched = await seed("PRJ-HIST-4");

    const run = await createRun(project.id, { name: "Only round" }, owner.id);
    await addCasesToRun(run.id, [testCase.id], owner.id);

    const history = await listRunHistoryForCases([testCase.id, untouched.testCase.id]);

    expect(history.get(testCase.id)).toHaveLength(1);
    // Absent rather than an empty array — the caller defaults, and a page
    // showing dozens of rows should not allocate for every one that has none.
    expect(history.get(untouched.testCase.id)).toBeUndefined();
  });

  it("keeps every answer recorded in a round, not only the last one", async () => {
    const { owner, project, testCase } = await seed("PRJ-HIST-7");

    const run = await createRun(project.id, { name: "Sprint 1" }, owner.id);
    await addCasesToRun(run.id, [testCase.id], owner.id);

    /* The real loop: the tester reports it broken, somebody fixes it, the
     * tester comes back. The row itself can only hold the last answer, so
     * without the events this round is indistinguishable from one that
     * passed first time — and the whole round trip disappears. */
    await setRunCaseResult(
      run.id,
      testCase.id,
      { testResult: "FAILED", notes: "Domain did not appear" },
      owner.id,
    );
    await setRunCaseResult(run.id, testCase.id, { testResult: "PASSED" }, owner.id);

    const history = (await listRunHistoryForCases([testCase.id])).get(testCase.id) ?? [];
    expect(history).toHaveLength(1);

    const round = history[0];
    expect(round.testResult).toBe("PASSED");
    expect(round.everFailed).toBe(true);
    expect(round.attempts.map((attempt) => attempt.testResult)).toEqual(["FAILED", "PASSED"]);
    // Oldest first, and the note stays on the attempt it was written for.
    expect(round.attempts[0].notes).toBe("Domain did not appear");
    expect(round.attempts[0].recordedBy).toBe("PRJ-HIST-7");
    expect(round.attempts[1].notes).toBeNull();

    expect(classifyPattern(history)).toBe("reworked");
  });

  it("keeps a result recorded outside any round, and dates the group by the day", async () => {
    const { owner, testCase } = await seed("PRJ-HIST-8");

    /* Recorded straight on the case, with no round open and none ever
     * created. This used to leave nothing behind at all: the case's own
     * column was overwritten and no history could reach it. */
    await updateTestResultAndNotes(
      testCase.id,
      { testResult: "FAILED", notes: "ลองก่อน sprint เปิด" },
      owner.id,
    );
    await updateTestResultAndNotes(testCase.id, { testResult: "PASSED" }, owner.id);

    const history = (await listRunHistoryForCases([testCase.id])).get(testCase.id) ?? [];

    /* One group, not two: both were recorded the same day, and the strip
     * reads a day as one sitting the way it reads a round as one round. */
    expect(history).toHaveLength(1);
    expect(history[0].testRunId).toBeNull();
    expect(history[0].attempts.map((a) => a.testResult)).toEqual(["FAILED", "PASSED"]);
    expect(history[0].attempts[0].notes).toBe("ลองก่อน sprint เปิด");
    expect(history[0].everFailed).toBe(true);
    expect(history[0].testResult).toBe("PASSED");

    // And the marks say there is no round to open.
    expect(toResultMarks(history).map((mark) => mark.testRunId)).toEqual([null, null]);
  });

  it("does not record an answer when only the note was edited", async () => {
    const { owner, testCase } = await seed("PRJ-HIST-9");

    await updateTestResultAndNotes(testCase.id, { notes: "a thought" }, owner.id);

    /* Writing a note is not answering the question, and counting it as one
     * would put a square in the strip for something nobody tested. */
    expect((await listRunHistoryForCases([testCase.id])).get(testCase.id)).toBeUndefined();
  });

  it("puts a round and a loose group in one timeline", async () => {
    const { owner, project, testCase } = await seed("PRJ-HIST-10");

    const run = await createRun(project.id, { name: "Sprint 1" }, owner.id);
    await addCasesToRun(run.id, [testCase.id], owner.id);
    await setRunCaseResult(run.id, testCase.id, { testResult: "FAILED" }, owner.id);
    await updateTestResultAndNotes(testCase.id, { testResult: "PASSED" }, owner.id);

    const history = (await listRunHistoryForCases([testCase.id])).get(testCase.id) ?? [];

    expect(history).toHaveLength(2);
    // The round first — it was created first — then what was recorded after it.
    expect(history[0].testRunId).toBe(run.id);
    expect(history[1].testRunId).toBeNull();

    /* And the two kinds are told apart on every mark, which is what the
     * report draws a border from. */
    expect(toResultMarks(history).map((mark) => mark.testRunId !== null)).toEqual([true, false]);
  });

  it("asks nothing of the database when asked about nothing", async () => {
    expect((await listRunHistoryForCases([])).size).toBe(0);
  });
});

describe("the Runs count on the Test Cases list", () => {
  it("counts rounds that hold the case, not rounds that ran it", async () => {
    const { owner, project, testCase } = await seed("PRJ-HIST-5");
    const group = (await prisma.testCase.findUniqueOrThrow({ where: { id: testCase.id } }))
      .testGroupId;

    const never = await createTestCase(
      group,
      {
        name: "No round has ever held this",
        expectedResult: "ok",
        priority: "MEDIUM",
        steps: [{ step: "s", expectedResult: "r" }],
      },
      owner.id,
    );

    const first = await createRun(project.id, { name: "Sprint 1" }, owner.id);
    const second = await createRun(project.id, { name: "Sprint 2" }, owner.id);
    await addCasesToRun(first.id, [testCase.id], owner.id);
    await addCasesToRun(second.id, [testCase.id], owner.id);

    const page = await listTestCasesWithStepsForTestGroupPage(group);
    const counts = new Map(page.items.map((row) => [row.id, row._count.runCases]));

    /* Two rounds hold it and neither has recorded anything. Counting rounds
     * that ran it would say 0 here — the same as the case below — and the
     * column exists precisely to tell those two apart: scheduled twice and
     * passed over is not the same as never looked at. */
    expect(counts.get(testCase.id)).toBe(2);
    expect(counts.get(never.id)).toBe(0);
  });

  it("does not credit a case for rounds that have been archived", async () => {
    const { owner, project, testCase } = await seed("PRJ-HIST-6");
    const group = (await prisma.testCase.findUniqueOrThrow({ where: { id: testCase.id } }))
      .testGroupId;

    const archived = await createRun(project.id, { name: "Archived" }, owner.id);
    await addCasesToRun(archived.id, [testCase.id], owner.id);
    await prisma.testRun.update({ where: { id: archived.id }, data: { deletedAt: new Date() } });

    const page = await listTestCasesWithStepsForTestGroupPage(group);
    const row = page.items.find((item) => item.id === testCase.id);

    // Coverage nobody can open is not coverage.
    expect(row?._count.runCases).toBe(0);
  });
});

/**
 * The classifier, with no database in the way. This is where the report is
 * right or wrong: everything above it only fetches rows, and everything
 * below it only draws them.
 */
describe("the shape a case's results make", () => {
  /* A round is written as the answers recorded in it, oldest first, so a
   * round someone had to come back to is `["FAILED", "PASSED"]` and one that
   * was right first time is just `"PASSED"`. */
  type Round = TestResult | TestResult[];

  const of = (...rounds: Round[]): RunHistoryEntry[] =>
    rounds.map((round, index) => {
      const attempts = Array.isArray(round) ? round : [round];
      const testResult = attempts[attempts.length - 1];
      return {
        testRunId: `r${index}`,
        runName: `Sprint ${index + 1}`,
        phase: null,
        testResult,
        notes: null,
        ranAt: testResult === "NOT_RUN" ? null : new Date(2026, 0, index + 1),
        ranBy: null,
        /* A bare "NOT_RUN" is a round nobody reached, so it has no attempts.
           Written as a list it is a round somebody recorded Not Run in, which
           is an answer like any other. */
        attempts:
          !Array.isArray(round) && testResult === "NOT_RUN"
            ? []
            : attempts.map((result, step) => ({
                testResult: result,
                notes: result === "FAILED" ? `broke on try ${step + 1}` : null,
                recordedAt: new Date(2026, 0, index + 1, step),
                recordedBy: null,
              })),
        everFailed: attempts.includes("FAILED"),
        everPassed: attempts.includes("PASSED"),
      };
    });

  it("names each shape", () => {
    expect(classifyPattern(of("FAILED", "FAILED", "FAILED"))).toBe("never-passed");
    expect(classifyPattern(of("PASSED", "PASSED"))).toBe("stable");
    expect(classifyPattern(of("PASSED", "PASSED", "FAILED"))).toBe("regression");
    expect(classifyPattern(of("FAILED", "PASSED", "PASSED"))).toBe("recovered");
    expect(classifyPattern(of("PASSED", "FAILED", "PASSED", "FAILED"))).toBe("unstable");
  });

  it("sees a round that was fixed before it ended, which the round's own result cannot", () => {
    /* This is the case the report used to be blind to. The tester records a
     * failure, the developer fixes it, the tester records a pass — and the
     * round ends green, so a rule reading only the round's result files the
     * case as stable and the page stays empty while the same case costs a
     * round trip every sprint. */
    expect(classifyPattern(of(["FAILED", "PASSED"], ["FAILED", "PASSED"]))).toBe("reworked");

    // Right the first time, every time, is a different thing and stays stable.
    expect(classifyPattern(of("PASSED", "PASSED"))).toBe("stable");

    /* One rocky round among clean ones still counts: it happened, and the
     * reader is the one who decides whether twice is a habit. */
    expect(classifyPattern(of("PASSED", ["FAILED", "PASSED"], "PASSED"))).toBe("reworked");
  });

  it("does not let a within-round fix outrank a round that was left broken", () => {
    /* Ending broken is worse than having been broken, so the patterns that
     * say something is wrong now win over the one that says it was. */
    expect(classifyPattern(of(["FAILED", "PASSED"], "FAILED"))).toBe("regression");
    expect(classifyPattern(of(["FAILED", "PASSED"], "FAILED", "PASSED", "FAILED"))).toBe(
      "unstable",
    );
    /* Not "never passed", which is what this used to say. Both sittings ended
     * broken, so every verdict is a failure — but somebody saw it working in
     * each of them, and the strip draws those green squares. A section headed
     * Never passed with green squares in it teaches its reader to distrust
     * the page. It worked and now does not, which is a regression. */
    expect(classifyPattern(of(["PASSED", "FAILED"], ["PASSED", "FAILED"]))).toBe("regression");
  });

  it("will not call a case that was seen working one that never passed", () => {
    /* The reported symptom: four cases sat under Never passed showing a green
     * square followed by a red one — recorded passing, then recorded failing,
     * inside one round. */
    expect(classifyPattern(of(["PASSED", "FAILED"]))).toBe("regression");

    // Never a pass anywhere, in any sitting, is what the name has to mean.
    expect(classifyPattern(of("FAILED", "FAILED"))).toBe("never-passed");
    expect(classifyPattern(of(["FAILED", "FAILED"], "FAILED"))).toBe("never-passed");
    // Blocked and skipped are not passes either.
    expect(classifyPattern(of(["BLOCKED", "FAILED"], "FAILED"))).toBe("never-passed");
  });

  it("counts rounds that cost a round trip apart from rounds left broken", () => {
    const { failed, hadFailure } = summariseHistory(of("PASSED", ["FAILED", "PASSED"], "FAILED"));
    // One round ended broken; two reported a failure at some point.
    expect(failed).toBe(1);
    expect(hadFailure).toBe(2);
  });

  it("draws one mark per answer recorded, not one per round", () => {
    /* The strip is the only place a failure that was fixed before the round
     * ended is visible, so its unit is the answer, not the round. */
    const marks = toResultMarks(of(["FAILED", "PASSED"], "PASSED", ["FAILED", "FAILED", "PASSED"]));
    expect(marks.map((mark) => mark.testResult)).toEqual([
      "FAILED",
      "PASSED",
      "PASSED",
      "FAILED",
      "FAILED",
      "PASSED",
    ]);

    // Which round each mark belongs to is not lost, and the rounds stay
    // visible as groups rather than running together.
    expect(marks.map((mark) => mark.startsRound)).toEqual([true, false, true, true, false, false]);
    expect(marks.map((mark) => mark.runName)).toEqual([
      "Sprint 1",
      "Sprint 1",
      "Sprint 2",
      "Sprint 3",
      "Sprint 3",
      "Sprint 3",
    ]);

    // The note stays with the answer it was written beside.
    expect(marks[0].notes).toBe("broke on try 1");
    expect(marks[1].notes).toBeNull();
  });

  it("still draws a round that recorded nothing individually", () => {
    /* Every round recorded before answers were kept one by one has no
     * attempts at all. Drawing from those alone would empty the strip of all
     * the history there was, so the round's own result stands in for one
     * mark — which is exactly what the strip used to show. */
    const legacy: RunHistoryEntry[] = [
      {
        testRunId: "r0",
        runName: "Sprint 1",
        phase: null,
        testResult: "FAILED",
        notes: "from before",
        ranAt: new Date(2026, 0, 1),
        ranBy: "Super Admin",
        attempts: [],
        everFailed: false,
        everPassed: false,
      },
    ];
    const marks = toResultMarks(legacy);
    expect(marks).toHaveLength(1);
    expect(marks[0]).toMatchObject({
      testResult: "FAILED",
      notes: "from before",
      by: "Super Admin",
      startsRound: true,
    });

    /* But a round nobody ever reached draws nothing. NOT_RUN is the absence
     * of an answer, and a square for it sat under a heading promising every
     * result recorded while recording none — the same reason the pattern
     * rules have always skipped it. */
    expect(toResultMarks(of("NOT_RUN"))).toEqual([]);
    expect(toResultMarks(of("PASSED", "NOT_RUN", "FAILED")).map((m) => m.testResult)).toEqual([
      "PASSED",
      "FAILED",
    ]);

    /* Setting Not Run by hand is not drawn either. It is how a result gets
     * taken back — the only way the app offered to free a case for removal —
     * and a grey square saying somebody answered "nothing" is not what that
     * was. The answers around it still stand. */
    expect(toResultMarks(of(["PASSED", "NOT_RUN"])).map((m) => m.testResult)).toEqual(["PASSED"]);
    expect(toResultMarks(of(["NOT_RUN"]))).toEqual([]);
  });

  it("separates what broke from what is unreliable, which a count cannot", () => {
    /* Both failed twice out of three. One broke and stayed broken; the other
     * cannot make up its mind. Sorting by "failed 2 times" would file them
     * together and send the same person to look at the same thing twice. */
    expect(classifyPattern(of("PASSED", "FAILED", "FAILED"))).toBe("regression");
    expect(classifyPattern(of("FAILED", "PASSED", "FAILED"))).toBe("unstable");
  });

  it("reads only verdicts, so a blocked round is not a failure", () => {
    /* BLOCKED means something stopped the tester, SKIPPED that they chose
     * not to, NOT_RUN that the round never got there. None is a statement
     * about the case, and counting them as failures would send someone
     * hunting a bug nobody ever reported. */
    expect(classifyPattern(of("PASSED", "BLOCKED", "SKIPPED", "PASSED"))).toBe("stable");
    expect(classifyPattern(of("NOT_RUN", "NOT_RUN"))).toBe("untested");
    expect(classifyPattern([])).toBe("untested");

    // And they do not break a run of verdicts into a change of mind.
    expect(classifyPattern(of("PASSED", "NOT_RUN", "FAILED"))).toBe("regression");
  });

  it("points at the round a regression started, and at no round otherwise", () => {
    const broke = of("PASSED", "PASSED", "FAILED", "FAILED");
    expect(brokeAt(broke)?.runName).toBe("Sprint 3");

    /* An unstable case has no single moment to blame, and naming one would
     * be picking a round out of several and calling it the cause. */
    expect(brokeAt(of("PASSED", "FAILED", "PASSED", "FAILED"))).toBeNull();
    expect(brokeAt(of("FAILED", "FAILED"))).toBeNull();
  });

});

describe("the Problem cases report", () => {
  it("groups a project's cases by shape, and leaves out the ones with nothing to show", async () => {
    const { owner, project, testCase: regressed } = await seed("PRJ-PROB-1");
    const group = (await prisma.testCase.findUniqueOrThrow({ where: { id: regressed.id } }))
      .testGroupId;

    const make = (name: string) =>
      createTestCase(
        group,
        {
          name,
          expectedResult: "ok",
          priority: "MEDIUM",
          steps: [{ step: "s", expectedResult: "r" }],
        },
        owner.id,
      );
    const alwaysBad = await make("Never passed");
    const good = await make("Always passed");
    const scheduledOnly = await make("In a round, never recorded");

    const first = await createRun(project.id, { name: "Sprint 1", phase: "P1" }, owner.id);
    const second = await createRun(project.id, { name: "Sprint 2", phase: "P2" }, owner.id);
    const ids = [regressed.id, alwaysBad.id, good.id, scheduledOnly.id];
    await addCasesToRun(first.id, ids, owner.id);
    await addCasesToRun(second.id, ids, owner.id);

    await setRunCaseResult(first.id, regressed.id, { testResult: "PASSED" }, owner.id);
    await setRunCaseResult(
      second.id,
      regressed.id,
      { testResult: "FAILED", notes: "stopped working" },
      owner.id,
    );
    await setRunCaseResult(first.id, alwaysBad.id, { testResult: "FAILED" }, owner.id);
    await setRunCaseResult(second.id, alwaysBad.id, { testResult: "FAILED" }, owner.id);
    await setRunCaseResult(first.id, good.id, { testResult: "PASSED" }, owner.id);
    await setRunCaseResult(second.id, good.id, { testResult: "PASSED" }, owner.id);

    const report = await listProblemCases(project.id);
    const byId = new Map(report.map((row) => [row.id, row]));

    expect(byId.get(regressed.id)?.pattern).toBe("regression");
    expect(byId.get(alwaysBad.id)?.pattern).toBe("never-passed");

    /* A case that has only ever passed is here now, under its own section —
     * the page is read to judge a case as well as to fix one. A case nothing
     * has recorded still is not: with no pass and no fail there is no shape
     * to show it under. */
    expect(byId.get(good.id)?.pattern).toBe("stable");
    expect(byId.has(scheduledOnly.id)).toBe(false);

    const row = byId.get(regressed.id)!;
    expect(row.brokeAt?.runName).toBe("Sprint 2");
    // The place, so a row can be acted on without working out where it lives.
    expect(row.path).toContain("Policy");
    /* And the feature tag beside the name: it is how the team names the work,
     * and reading it off the path means reading the whole path. */
    expect(row.feature).toBe("Usage Document");
    expect(row.href).toContain(`/projects/${project.id}/modules/`);
    expect(row.href).toContain(`/test-cases/${regressed.id}`);
  });

  it("names a case that only ever failed outside a round", async () => {
    /* The whole point of the work. Before this the report queried rounds and
     * nothing else, so a case marked FAILED on its own page showed as failing
     * on the Dashboard, dragged its Requirement to In Progress, and was
     * absent from the one page whose job is saying what is going wrong. */
    const { owner, project, testCase } = await seed("PRJ-PROB-3");

    await updateTestResultAndNotes(
      testCase.id,
      { testResult: "FAILED", notes: "พังตั้งแต่ยังไม่เปิด sprint" },
      owner.id,
    );

    const rows = await listProblemCases(project.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(testCase.id);
    expect(rows[0].pattern).toBe("never-passed");
    expect(rows[0].history[0].testRunId).toBeNull();
  });

  it("leaves loose results out when asked about one phase only", async () => {
    /* A phase belongs to a round, so an answer given outside one has no phase
     * to match. Letting it in would file it under a phase it was never part
     * of; the filter means "what happened in this phase". */
    const { owner, project, testCase } = await seed("PRJ-PROB-4");

    const run = await createRun(project.id, { name: "Sprint 1", phase: "P1" }, owner.id);
    await addCasesToRun(run.id, [testCase.id], owner.id);
    await setRunCaseResult(run.id, testCase.id, { testResult: "PASSED" }, owner.id);
    await updateTestResultAndNotes(testCase.id, { testResult: "FAILED" }, owner.id);

    // Across everything: passed in the round, then broke outside it.
    const all = await listProblemCases(project.id);
    expect(all[0]?.pattern).toBe("regression");
    expect(all[0]?.history).toHaveLength(2);

    /* Inside the phase there is only the round, and the round was fine — the
     * failure recorded outside it belongs to no phase and is not borrowed
     * into this one. */
    const thisPhase = await listProblemCases(project.id, { phase: "P1" });
    expect(thisPhase.map((row) => row.pattern)).toEqual(["stable"]);
    expect(thisPhase[0].history).toHaveLength(1);
  });

  it("keeps the cases that have only ever passed, so a case can be judged too", async () => {
    const { owner, project, testCase } = await seed("PRJ-PROB-5");

    const run = await createRun(project.id, { name: "Sprint 1" }, owner.id);
    await addCasesToRun(run.id, [testCase.id], owner.id);
    await setRunCaseResult(run.id, testCase.id, { testResult: "PASSED" }, owner.id);

    const rows = await listProblemCases(project.id);
    expect(rows.map((row) => row.pattern)).toEqual(["stable"]);
  });

  it("still leaves out a case nobody has answered for", async () => {
    /* Scheduled into a round and never reached. With no pass and no fail
     * there is no shape, and the Runs column is where those are found. */
    const { owner, project, testCase } = await seed("PRJ-PROB-6");
    const run = await createRun(project.id, { name: "Sprint 1" }, owner.id);
    await addCasesToRun(run.id, [testCase.id], owner.id);

    expect(await listProblemCases(project.id)).toHaveLength(0);
  });

  it("puts the case that fails most at the top of its pattern", async () => {
    const { owner, project, group } = await seed("PRJ-PROB-7");
    const once = await createTestCase(
      group.id,
      {
        name: "Slipped once",
        expectedResult: "ok",
        priority: "MEDIUM",
        steps: [{ step: "s", expectedResult: "r" }],
      },
      owner.id,
    );
    const often = await createTestCase(
      group.id,
      {
        name: "Fails constantly",
        expectedResult: "ok",
        priority: "MEDIUM",
        steps: [{ step: "s", expectedResult: "r" }],
      },
      owner.id,
    );

    const run = await createRun(project.id, { name: "Sprint 1" }, owner.id);
    await addCasesToRun(run.id, [once.id, often.id], owner.id);
    await setRunCaseResult(run.id, once.id, { testResult: "FAILED" }, owner.id);
    for (let i = 0; i < 4; i++) {
      await setRunCaseResult(run.id, often.id, { testResult: "FAILED" }, owner.id);
    }

    /* Both never passed. What separates them is how much trouble they have
     * been, and the order used to be whatever the database handed back. */
    const rows = await listProblemCases(project.id);
    expect(rows.map((row) => row.name)).toEqual(["Fails constantly", "Slipped once"]);
    expect(failureCount(rows[0].history)).toBe(4);
    expect(failureCount(rows[1].history)).toBe(1);
  });

  it("narrows to cases whose name matches, whatever shape they are", async () => {
    const { owner, project, group } = await seed("PRJ-PROB-10");
    const wanted = await createTestCase(
      group.id,
      {
        name: "ลบ Domain ออกจาก Policy",
        expectedResult: "ok",
        priority: "MEDIUM",
        steps: [{ step: "s", expectedResult: "r" }],
      },
      owner.id,
    );
    const other = await createTestCase(
      group.id,
      {
        name: "Nothing to do with it",
        expectedResult: "ok",
        priority: "MEDIUM",
        steps: [{ step: "s", expectedResult: "r" }],
      },
      owner.id,
    );
    await updateTestResultAndNotes(wanted.id, { testResult: "FAILED" }, owner.id);
    await updateTestResultAndNotes(other.id, { testResult: "FAILED" }, owner.id);

    const rows = await listProblemCases(project.id, { search: "domain" });
    expect(rows.map((row) => row.id)).toEqual([wanted.id]);

    // Case does not matter, and a search nothing matches is empty, not everything.
    expect(await listProblemCases(project.id, { search: "DOMAIN" })).toHaveLength(1);
    expect(await listProblemCases(project.id, { search: "nothing like this" })).toHaveLength(0);
  });

  it("never reaches into another project", async () => {
    /* The loose events are read by their own query rather than through a
     * round, so the project filter on them is written by hand and is the one
     * thing standing between two customers' reports. */
    const mine = await seed("PRJ-PROB-8");
    const theirs = await seed("PRJ-PROB-9");

    await updateTestResultAndNotes(theirs.testCase.id, { testResult: "FAILED" }, theirs.owner.id);
    await updateTestResultAndNotes(mine.testCase.id, { testResult: "FAILED" }, mine.owner.id);

    const rows = await listProblemCases(mine.project.id);
    expect(rows.map((row) => row.id)).toEqual([mine.testCase.id]);

    // And the same the other way round, so neither is leaking into the other.
    const others = await listProblemCases(theirs.project.id);
    expect(others.map((row) => row.id)).toEqual([theirs.testCase.id]);
  });

  it("narrows to one phase, which can change what shape a case has", async () => {
    const { owner, project, testCase } = await seed("PRJ-PROB-2");

    const old = await createRun(project.id, { name: "Old", phase: "P1" }, owner.id);
    const recent = await createRun(project.id, { name: "Recent", phase: "P2" }, owner.id);
    await addCasesToRun(old.id, [testCase.id], owner.id);
    await addCasesToRun(recent.id, [testCase.id], owner.id);
    await setRunCaseResult(old.id, testCase.id, { testResult: "PASSED" }, owner.id);
    await setRunCaseResult(recent.id, testCase.id, { testResult: "FAILED" }, owner.id);

    // Across everything it passed once and then broke.
    expect((await listProblemCases(project.id))[0]?.pattern).toBe("regression");

    /* Inside the recent phase alone there is no pass to have regressed from,
     * so the same case reads as never having passed. The filter is the
     * reader's because the honest answer depends on which question they are
     * asking, and neither is wrong. */
    const thisPhase = await listProblemCases(project.id, { phase: "P2" });
    expect(thisPhase[0]?.pattern).toBe("never-passed");
    expect(thisPhase[0]?.history).toHaveLength(1);
  });
});
