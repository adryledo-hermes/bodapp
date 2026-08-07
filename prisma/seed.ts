import { PrismaClient } from "../src/generated/prisma/client";
import { adapter } from "../src/lib/db";
import { hashPassword } from "../src/lib/password";

const prisma = new PrismaClient({ adapter });

async function main() {
  // Demo wedding for task 2 (auth). Extend later.
  const slug = "demo";
  const existing = await prisma.wedding.findUnique({ where: { slug } });
  if (existing) {
    console.log("Demo wedding already exists; skipping.");
    return;
  }

  const wedding = await prisma.wedding.create({
    data: {
      slug,
      coupleNameA: "Adrián",
      coupleNameB: "Aitana",
      locale: "es",
    },
  });

  await prisma.user.create({
    data: {
      weddingId: wedding.id,
      email: "adrian@bodapp.test",
      passwordHash: await hashPassword("changeme"),
      role: "couple",
    },
  });

  console.log("Seeded demo wedding + couple account");
  console.log("  email: adrian@bodapp.test");
  console.log("  password: changeme");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
