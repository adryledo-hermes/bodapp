import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession, tenantWhere } from "@/lib/auth-guard";
import { TASKS_SEED } from "@/lib/tasks";

// POST /api/wedding/seed-tasks — insert the canonical Spanish checklist.
// Idempotent: only seeds when the wedding has NO tasks yet, so re-hitting the
// endpoint never duplicates the checklist. Returns how many were inserted.
export async function POST() {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  const existing = await prisma.task.count({
    where: tenantWhere(auth.session),
  });
  if (existing > 0) {
    return NextResponse.json({ inserted: 0, alreadySeeded: true });
  }

  const created = await prisma.task.createMany({
    data: TASKS_SEED.map((seed) => ({
      title: seed.title,
      category: seed.category,
      priority: seed.priority,
      status: seed.status,
      description: seed.description ?? null,
      weddingId: auth.session.weddingId,
    })),
  });

  return NextResponse.json({ inserted: created.count, alreadySeeded: false });
}
