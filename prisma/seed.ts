/**
 * Brings an empty database to the point where someone can actually use the
 * app: an account, and a Project that account is ADMIN of.
 *
 * The Project is not decoration. There is no global admin flag in this
 * schema — `User` carries no role at all, and every privileged check goes
 * through `isAdminAnywhere` (src/lib/rbac.ts), which asks whether you hold
 * ADMIN on *some* Project. A seeded user with no membership can sign in and
 * then do nothing: "+ New Project" is hidden and /members 404s, and creating
 * a Project through the API would only make them QA_LEAD, so there is no way
 * out of it from inside the app.
 *
 * Hence ADMIN written directly here rather than going through
 * `createProject`, which deliberately gives its caller QA_LEAD.
 *
 * Re-runnable: it fills in whatever is missing and changes nothing else. If
 * the account already exists but holds no ADMIN anywhere — the state this
 * function used to leave behind — running it again repairs that.
 */
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth-credentials";

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "changeme123";
  const projectCode = process.env.SEED_PROJECT_CODE ?? "local-001";
  const projectName = process.env.SEED_PROJECT_NAME ?? "Local";

  const existingUser = await prisma.user.findUnique({ where: { email } });
  const user =
    existingUser ??
    (await prisma.user.create({
      data: { email, passwordHash: await hashPassword(password), name: "Admin" },
    }));
  console.log(existingUser ? `User ${email} already exists.` : `Created user ${email}.`);

  /* The password of an existing account is never touched: someone who has
   * changed theirs should not have it reset by a re-run. */

  const existingProject = await prisma.project.findUnique({ where: { code: projectCode } });
  const project =
    existingProject ??
    (await prisma.project.create({
      data: {
        code: projectCode,
        name: projectName,
        status: "ACTIVE",
        ownerId: user.id,
      },
    }));
  console.log(
    existingProject
      ? `Project ${projectCode} already exists.`
      : `Created project ${projectCode}.`,
  );

  const membership = await prisma.projectMember.upsert({
    where: { projectId_userId: { projectId: project.id, userId: user.id } },
    update: { role: "ADMIN" },
    create: { projectId: project.id, userId: user.id, role: "ADMIN" },
  });
  console.log(`${email} is ${membership.role} of ${projectCode}.`);
  console.log("That ADMIN is what unlocks Members and New Project across the app.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
