import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth-guard";
import { getInvitationAccess } from "@/lib/otp-session";
import { readPhoto } from "@/lib/storage";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/photos/[id]/file
 * Serves the on-disk photo bytes to the browser.
 * Authorized either by the panel session OR the guest invitation-access cookie,
 * so both the panel and the public invitation page can display images.
 */
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;

  // Try panel session first, then guest invitation access.
  let weddingId: string | null = null;
  const auth = await requireSession();
  if (!auth.error) {
    weddingId = auth.session.weddingId;
  } else {
    const access = await getInvitationAccess();
    if (access) {
      weddingId = access.weddingId;
    }
  }

  if (!weddingId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const photo = await prisma.photo.findFirst({
    where: { id, weddingId },
  });
  if (!photo) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  let bytes: Buffer;
  try {
    bytes = await readPhoto(photo.filename);
  } catch {
    return NextResponse.json({ error: "file missing" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": photo.mimeType,
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, max-age=3600",
    },
  });
}