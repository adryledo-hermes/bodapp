import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth-guard";
import { readPhoto } from "@/lib/storage";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/photos/[id]/file
// Serves the on-disk photo bytes to the browser. Panel-authorized and
// tenant-scoped: returns 404 unless the photo belongs to the session wedding.
export async function GET(_req: Request, { params }: Ctx) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  const { id } = await params;

  const photo = await prisma.photo.findFirst({
    where: { id, weddingId: auth.session.weddingId },
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
