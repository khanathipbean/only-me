import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth-credentials";

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "changeme123";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Seed user ${email} already exists, skipping.`);
    return;
  }

  await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(password),
      name: "Admin",
    },
  });

  console.log(`Created seed user ${email}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
