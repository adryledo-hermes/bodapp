import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession, tenantWhere } from "@/lib/auth-guard";
import { taskCreateSchema } from "@/lib/tasks-schema";

// GET /api/tasks — list the session's wedding tasks (tenant-scoped, newest last).
export async function GET() {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  const tasks = await prisma.task.findMany({
    where: tenantWhere(auth.session),
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ tasks });
}

// POST /api/tasks — create a task for the session's wedding.
export async function POST(req: Request) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const parsed = taskCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid input", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const task = await prisma.task.create({
    data: {
      title: parsed.data.title,
      category: parsed.data.category,
      priority: parsed.data.priority,
      status: parsed.data.status,
      dueDate: parsed.data.dueDate,
      description: parsed.data.description ?? null,
      notes: parsed.data.notes ?? null,
      weddingId: auth.session.weddingId,
    },
  });
  return NextResponse.json({ task }, { status: 201 });
}
