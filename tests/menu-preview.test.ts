import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

import { auth } from "@/auth";
import { POST as createProjectRoute } from "@/app/api/projects/route";
import { GET as getMenuPreview } from "@/app/api/projects/[id]/menu-preview/route";
import { createModule } from "@/lib/modules";
import { createRequirement } from "@/lib/requirements";
import { createScenario } from "@/lib/scenarios";
import { createTestGroup } from "@/lib/test-groups";
import { createTestCase, updateTestResultAndNotes } from "@/lib/test-cases";
import { createNote } from "@/lib/notes";
import { addCasesToRun, createRun, setRunCaseResult } from "@/lib/test-runs";
import { createLink } from "@/lib/links";
import {
  firstLine,
  getMenuPreview as buildMenuPreview,
  initialsFor,
  linkMark,
  sharesOfLargest,
  sharesOfTotal,
  shortWhen,
  weekBuckets,
} from "@/lib/menu-preview";
import { createUser, jsonRequest, sessionFor, uniqueCode, uniqueEmail } from "./support/fixtures";

const mockAuth = vi.mocked(auth);

/** Everything a reader with the run of the project holds, which is what the
 *  menus draw for a QA_LEAD or an ADMIN. */
const EVERYTHING = [
  "reading.overview",
  "reading.dashboard",
  "reading.problems",
  "project.audit",
  "notes.view",
  "files.view",
] as const;

async function setup() {
  const code = uniqueCode("prj-menu");
  const owner = await createUser(uniqueEmail("menu-owner"));
  mockAuth.mockResolvedValue(sessionFor(owner.id) as never);
  const project = await (
    await createProjectRoute(
      jsonRequest("http://test/api/projects", "POST", {
        code,
        name: `Project ${code}`,
        status: "DRAFT",
      }),
    )
  ).json();
  return { owner, project };
}

/** A module holding `names.length` test cases, each with the result given,
 *  so a test can say what the project is made of in one line. */
async function seedModule(
  projectId: string,
  ownerId: string,
  moduleName: string,
  results: readonly string[],
) {
  const testModule = await createModule(projectId, moduleName, ownerId);
  const requirement = await createRequirement(
    projectId,
    { name: `${moduleName} requirement`, moduleId: testModule.id, priority: "MEDIUM" },
    ownerId,
  );
  const scenario = await createScenario(
    projectId,
    {
      name: `${moduleName} scenario`,
      requirementId: requirement.id,
      expectedResult: "it works",
      priority: "MEDIUM",
      tags: [],
    },
    ownerId,
  );
  const group = await createTestGroup(scenario.id, { name: `${moduleName} group` }, ownerId);

  for (const [index, result] of results.entries()) {
    const testCase = await createTestCase(
      group.id,
      {
        name: `${moduleName} TC${index + 1}`,
        expectedResult: "ok",
        priority: "MEDIUM",
        status: "READY",
        steps: [{ step: "s", expectedResult: "r" }],
      },
      ownerId,
    );
    if (result !== "NOT_RUN") {
      await updateTestResultAndNotes(
        testCase.id,
        { testResult: result as "PASSED" | "FAILED" },
        ownerId,
      );
    }
  }

  return { testModule, group };
}

describe("menu preview — the sums behind each drawing", () => {
  it("shares of the largest leave the biggest bar full and the rest fractions of it", () => {
    expect(sharesOfLargest([9, 6, 3])).toEqual([100, (6 / 9) * 100, (3 / 9) * 100]);
  });

  /* A project with nothing in it is the common case on day one, and the one
     that divides by nothing. */
  it("gives every share as zero rather than NaN when there is nothing to divide", () => {
    expect(sharesOfLargest([0, 0])).toEqual([0, 0]);
    expect(sharesOfTotal([0, 0])).toEqual([0, 0]);
  });

  it("shares of the total add up to the whole bar", () => {
    const shares = sharesOfTotal([268, 212, 135]);
    expect(shares.reduce((sum, share) => sum + share, 0)).toBeCloseTo(100);
  });

  it("buckets the week by calendar day, oldest first, today last", () => {
    const now = new Date(2026, 10, 19, 15, 0);
    const week = weekBuckets(
      [
        new Date(2026, 10, 19, 9, 0), // today
        new Date(2026, 10, 19, 23, 30), // today, late
        new Date(2026, 10, 18, 1, 0), // yesterday
        new Date(2026, 10, 1), // long before the week
      ],
      now,
    );

    expect(week).toHaveLength(7);
    expect(week[6].count).toBe(2);
    expect(week[5].count).toBe(1);
    /* The one from a fortnight ago is outside the week and must not be
       folded into the oldest column, which would make Thursday look busy
       for reasons nobody could find. */
    expect(week.reduce((sum, day) => sum + day.count, 0)).toBe(3);
  });

  it("names the days so the last one is the day now falls in", () => {
    const week = weekBuckets([], new Date(2026, 10, 19));
    expect(week[6].day).toBe("Thu");
    expect(week[0].day).toBe("Fri");
  });

  it("takes initials from a name, and falls back to the address", () => {
    expect(initialsFor("Khanathip Bean", null)).toBe("KB");
    expect(initialsFor("Prem", null)).toBe("PR");
    expect(initialsFor(null, "someone@example.com")).toBe("SO");
  });

  /* The addresses this team keeps are bare IPs, where a mark read off the
     host would be "10" on every row. */
  it("marks a link from its title, not its address", () => {
    expect(linkMark("PROM — Developer")).toBe("DEV");
    expect(linkMark("PROM — Unit Test")).toBe("UT");
    expect(linkMark("")).toBe("LN");
  });

  it("takes a note's first line, skipping the blank ones", () => {
    expect(firstLine("\n\n  decided to ship  \nand then")).toBe("decided to ship");
    expect(firstLine("")).toBe("");
  });

  it("says how long ago in as few characters as a row can spare", () => {
    const now = new Date(2026, 10, 19, 12, 0);
    expect(shortWhen(new Date(2026, 10, 19, 11, 30), now)).toBe("30m");
    expect(shortWhen(new Date(2026, 10, 19, 9, 0), now)).toBe("3h");
    expect(shortWhen(new Date(2026, 10, 17, 12, 0), now)).toBe("2d");
  });
});

describe("menu preview — what it reads out of a project", () => {
  beforeEach(() => {
    mockAuth.mockReset();
  });

  it("splits the summary bar by module, in proportion to the cases each holds", async () => {
    const { owner, project } = await setup();
    await seedModule(project.id, owner.id, "Policy Center", ["PASSED", "PASSED", "FAILED"]);
    await seedModule(project.id, owner.id, "Master Metric", ["NOT_RUN"]);

    const { summary } = await buildMenuPreview(project.id, [...EVERYTHING]);

    expect(summary?.testCases).toBe(4);
    /* Largest first: the bar reads left to right. */
    expect(summary?.modules.map((module) => module.name)).toEqual([
      "Policy Center",
      "Master Metric",
    ]);
    expect(summary?.modules[0].share).toBeCloseTo(75);
    expect(summary?.modules[1].share).toBeCloseTo(25);
    expect(summary?.requirements).toBe(2);
    expect(summary?.scenarios).toBe(2);
    expect(summary?.testGroups).toBe(2);
  });

  it("counts the dashboard's results and says how many modules the failures touch", async () => {
    const { owner, project } = await setup();
    await seedModule(project.id, owner.id, "Policy Center", ["PASSED", "FAILED"]);
    await seedModule(project.id, owner.id, "Data Governance", ["FAILED", "NOT_RUN"]);

    const { dashboard } = await buildMenuPreview(project.id, [...EVERYTHING]);

    expect(dashboard?.testCases).toBe(4);
    expect(dashboard?.passed).toBe(1);
    expect(dashboard?.failed).toBe(2);
    expect(dashboard?.notRun).toBe(1);
    /* Three of the four have a verdict recorded — the same sum the Dashboard
       page calls Test Progress. */
    expect(dashboard?.progress).toBeCloseTo(75);
    expect(dashboard?.failedModules).toBe(2);
    /* Nobody has opened a round, so there is none to draw — and null is not
       the same as a round with nothing in it. */
    expect(dashboard?.latestRun).toBeNull();
  });

  it("names the round in progress and how much of it has been answered", async () => {
    const { owner, project } = await setup();
    const { group } = await seedModule(project.id, owner.id, "Policy Center", ["PASSED"]);
    const cases = await prisma.testCase.findMany({ where: { testGroupId: group.id } });
    const run = await createRun(project.id, { name: "Round 1" }, owner.id);
    await addCasesToRun(
      run.id,
      cases.map((testCase) => testCase.id),
      owner.id,
    );
    await setRunCaseResult(run.id, cases[0].id, { testResult: "PASSED" }, owner.id);

    const { dashboard } = await buildMenuPreview(project.id, [...EVERYTHING]);

    expect(dashboard?.latestRun).toEqual({ name: "Round 1", answered: 1, total: 1 });
  });

  it("names the cases that have failed most, in the order the page reads", async () => {
    const { owner, project } = await setup();
    const { group } = await seedModule(project.id, owner.id, "Policy Center", [
      "FAILED",
      "FAILED",
    ]);
    const cases = await prisma.testCase.findMany({
      where: { testGroupId: group.id },
      orderBy: { name: "asc" },
    });
    /* Two rounds for the first case and one for the second, so the order is
       the failure count rather than whatever the database hands back. */
    for (const round of ["Round 1", "Round 2"]) {
      const ids = round === "Round 1" ? cases.map((testCase) => testCase.id) : [cases[0].id];
      const run = await createRun(project.id, { name: round }, owner.id);
      await addCasesToRun(run.id, ids, owner.id);
      for (const id of ids) {
        await setRunCaseResult(run.id, id, { testResult: "FAILED" }, owner.id);
      }
    }

    const { problems } = await buildMenuPreview(project.id, [...EVERYTHING]);

    expect(problems?.total).toBe(2);
    /* The order is what matters, and that it is the failure count that sets
       it. The absolute figures are `failureCount`'s to define — a case also
       carries the result written on it outside any round — so asserting one
       here would be this test's guess about another function's internals. */
    expect(problems?.worst.map((problem) => problem.name)).toEqual([
      cases[0].name,
      cases[1].name,
    ]);
    expect(problems!.worst[0].failures).toBeGreaterThan(problems!.worst[1].failures);
  });

  it("leaves a deleted case out of every count", async () => {
    const { owner, project } = await setup();
    const { group } = await seedModule(project.id, owner.id, "Policy Center", ["PASSED"]);
    const doomed = await createTestCase(
      group.id,
      {
        name: "TC deleted",
        expectedResult: "ok",
        priority: "MEDIUM",
        status: "READY",
        steps: [{ step: "s", expectedResult: "r" }],
      },
      owner.id,
    );
    await prisma.testCase.update({
      where: { id: doomed.id },
      data: { deletedAt: new Date() },
    });

    const { summary, dashboard } = await buildMenuPreview(project.id, [...EVERYTHING]);

    expect(summary?.testCases).toBe(1);
    expect(dashboard?.testCases).toBe(1);
  });

  it("reads the newest notes and links, with a note's first line", async () => {
    const { owner, project } = await setup();
    await createNote(
      project.id,
      { title: "Kickoff", body: "agreed to start on the 20th\nsecond line" },
      owner.id,
    );
    await createLink(
      project.id,
      { title: "PROM — Developer", url: "http://10.10.10.76/" },
      owner.id,
    );

    const { notes, links } = await buildMenuPreview(project.id, [...EVERYTHING]);

    expect(notes?.total).toBe(1);
    expect(notes?.recent[0].title).toBe("Kickoff");
    expect(notes?.recent[0].line).toBe("agreed to start on the 20th");
    expect(links?.total).toBe(1);
    expect(links?.recent[0].url).toBe("http://10.10.10.76/");
    expect(links?.recent[0].mark).toBe("DEV");
  });

  it("gives an empty project every section, each empty — absent means refused", async () => {
    const { project } = await setup();

    const preview = await buildMenuPreview(project.id, [...EVERYTHING]);

    expect(preview.summary?.testCases).toBe(0);
    expect(preview.summary?.modules).toEqual([]);
    expect(preview.dashboard?.testCases).toBe(0);
    expect(preview.dashboard?.progress).toBe(0);
    expect(preview.problems?.total).toBe(0);
    expect(preview.problems?.worst).toEqual([]);
    expect(preview.dashboard?.latestRun).toBeNull();
    expect(preview.notes?.total).toBe(0);
    expect(preview.files?.total).toBe(0);
    expect(preview.links?.total).toBe(0);
  });

  /* The whole point of taking the capability list: a section a reader cannot
     open must not be built, let alone sent. */
  it("builds nothing for a section the reader does not hold", async () => {
    const { owner, project } = await setup();
    await seedModule(project.id, owner.id, "Policy Center", ["PASSED"]);

    const preview = await buildMenuPreview(project.id, ["reading.dashboard"]);

    expect(preview.dashboard).toBeDefined();
    expect(preview.summary).toBeUndefined();
    expect(preview.problems).toBeUndefined();
    expect(preview.audit).toBeUndefined();
    expect(preview.notes).toBeUndefined();
    expect(preview.files).toBeUndefined();
    expect(preview.links).toBeUndefined();
  });
});

describe("menu preview — the route", () => {
  beforeEach(() => {
    mockAuth.mockReset();
  });

  async function ask(projectId: string) {
    return getMenuPreview(
      jsonRequest(`http://test/api/projects/${projectId}/menu-preview`, "GET"),
      { params: Promise.resolve({ id: projectId }) },
    );
  }

  it("answers a member with the sections their role holds", async () => {
    const { owner, project } = await setup();
    await seedModule(project.id, owner.id, "Policy Center", ["PASSED"]);

    const body = await (await ask(project.id)).json();

    expect(body.summary.testCases).toBe(1);
    expect(body.dashboard.passed).toBe(1);
  });

  /* A DEV holds the Dashboard and none of Overview's other three. The menu
     lists one of the four for them, and this must agree. */
  it("leaves out what a DEV may not open", async () => {
    const { owner, project } = await setup();
    await seedModule(project.id, owner.id, "Policy Center", ["PASSED"]);
    const dev = await createUser(uniqueEmail("menu-dev"));
    await prisma.projectMember.create({
      data: { projectId: project.id, userId: dev.id, role: "DEV" },
    });
    mockAuth.mockResolvedValue(sessionFor(dev.id) as never);

    const body = await (await ask(project.id)).json();

    expect(body.dashboard).toBeDefined();
    expect(body.summary).toBeUndefined();
    expect(body.problems).toBeUndefined();
    expect(body.audit).toBeUndefined();
  });

  it("refuses somebody who is not on the project at all", async () => {
    const { project } = await setup();
    const stranger = await createUser(uniqueEmail("menu-stranger"));
    mockAuth.mockResolvedValue(sessionFor(stranger.id) as never);

    expect((await ask(project.id)).status).toBe(403);
  });

  it("refuses a caller with no session", async () => {
    const { project } = await setup();
    mockAuth.mockResolvedValue(null as never);

    expect((await ask(project.id)).status).toBe(401);
  });
});
