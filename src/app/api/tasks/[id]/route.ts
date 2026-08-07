import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth-guard";
import { taskUpdateSchema } from "@/lib/tasks-schema";

type Ctx = { params: Promise<{ id: string }> };

// Guard: fetch a task only if it belongs to the session's wedding.
async function fetchOwnedTask(id: string, weddingId: string) {
  return prisma.task.findFirst({ where: { id, weddingId } });
}

// PATCH /api/tasks/[id] — update any field (status drag, inline edits, etc.).
export async function PATCH(req: Request, { params }: Ctx) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  const { id } = await params;

  const owned = await fetchOwnedTask(id, auth.session.weddingId);
  if (!owned) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const parsed = taskUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid input", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Only write back the fields the client actually sent.
  const data: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) data.title = parsed.data.title;
  if (parsed.data.category !== undefined) data.category = parsed.data.category;
  if (parsed.data.priority !== undefined) data.priority = parsed.data.priority;
  if (parsed.data.status !== undefined) data.status = parsed.data.status;
  if (parsed.data.dueDate !== undefined) data.dueDate = parsed.data.dueDate;
  if (parsed.data.description !== undefined) data.description = parsed.data.description ?? null;
  if (parsed.data.notes !== undefined) data.notes = parsed.data.notes ?? null;

  const task = await prisma.task.update({ where: { id }, data });
  return NextResponse.json({ task });
}

// DELETE /api/tasks/[id] — remove a task.
export async function DELETE(_req: Request, { params }: Ctx) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  const { id } = await params;

  const owned = await fetchOwnedTask(id, auth.session.weddingId);
  if (!owned) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  await prisma.task.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
