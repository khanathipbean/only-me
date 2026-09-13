import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/* max: 1 — on a serverless host, every request can land in its own
 * container, each holding its own pool; a large per-container pool
 * multiplies straight into the shared pooler's connection cap. Safe to
 * keep this small in front of Supabase's own pgbouncer, which is what
 * actually multiplexes concurrent callers onto few Postgres connections. */
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 1 });

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
