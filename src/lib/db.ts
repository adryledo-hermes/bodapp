import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

// Shared adapter + client (avoid connection exhaustion in dev HMR).
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  adapter?: PrismaPg;
};

function createAdapter(): PrismaPg {
  const url = process.env.DATABASE_URL;
  if (!url) {
    // Fail fast with a clear message instead of a cryptic PG error.
    throw new Error("DATABASE_URL is not set. See .env.example");
  }
  // PrismaPg accepts a connection string or a pg PoolConfig.
  return new PrismaPg({ connectionString: url });
}

export const adapter = globalForPrisma.adapter ?? createAdapter();
export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.adapter = adapter;
  globalForPrisma.prisma = prisma;
}
