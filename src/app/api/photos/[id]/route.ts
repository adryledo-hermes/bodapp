import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth-guard";
import { deletePhoto } from "@/lib/storage";

type Ctx = { params: Promise<{ id: string }> };

// DELETE /api/photos/[id]
// Deletes the DB row AND the file on disk, only if it belongs to the session's
// wedding (tenant-scoped — 404 if not owned).
export async function DELETE(_req: Request, { params }: Ctx) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  const { id } = await params;

  const photo = await prisma.photo.findFirst({
    where: { id, weddingId: auth.session.weddingId },
  });
  if (!photo) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  await prisma.photo.delete({
    where: { id, weddingId: auth.session.weddingId },
  });
  // Best effort: remove the file even if the DB delete already happened. Guarded
  // against traversal by deletePhoto.
  await deletePhoto(photo.filename).catch(() => {});

  return NextResponse.json({ ok: true });
}
