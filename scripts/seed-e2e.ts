import { hashPassword } from "@/lib/auth-credentials";
import { prisma } from "@/lib/prisma";
import {
  MISSING_FILE_NAME,
  E2E_EMAIL,
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

  return { user, viewer, project };
}

async function main() {
  const { project } = await seedBaseline();
  console.log(`e2e baseline ready: project ${project.code}`);
  await prisma.$disconnect();
}

void main();
