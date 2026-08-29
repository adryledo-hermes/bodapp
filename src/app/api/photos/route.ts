import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { requireSession, tenantWhere } from "@/lib/auth-guard";
import { deletePhoto, savePhoto } from "@/lib/storage";

/** Max upload size: 10 MB. */
const MAX_SIZE = 10 * 1024 * 1024;

/** Allowed image mime types → stored file extension. */
const MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

function serialize(photo: {
  id: string;
  mimeType: string;
  size: number;
  createdAt: Date;
}) {
  return {
    id: photo.id,
    mimeType: photo.mimeType,
    size: photo.size,
    createdAt: photo.createdAt.toISOString(),
  };
}

// GET /api/photos — list the session wedding's photos (tenant-scoped).
// Returns ONLY gallery-purpose photos; profile/invitation uploads are assets
// referenced elsewhere, not gallery content.
export async function GET() {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  const photos = await prisma.photo.findMany({
    where: { ...tenantWhere(auth.session), purpose: "gallery" },
    orderBy: { createdAt: "desc" },
    select: { id: true, mimeType: true, size: true, createdAt: true },
  });

  return NextResponse.json({ photos: photos.map(serialize) });
}

// POST /api/photos — upload a photo for the session wedding
// ?purpose=gallery (default) | profile | invitation — tags the photo origin so
// the photos panel can show ONLY gallery uploads (Upload-photo button).
export async function POST(req: Request) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  const allowedPurposes = new Set(["gallery", "profile", "invitation"]);
  const purpose = (() => {
    const p = new URL(req.url).searchParams.get("purpose");
    return p && allowedPurposes.has(p) ? p : "gallery";
  })();

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid_form" }, { status: 400 });
  }

  const file = form.get("photo");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "photo_required" }, { status: 400 });
  }

  const ext = MIME_TO_EXT[file.type];
  if (!ext) {
    return NextResponse.json({ error: "file_type_not_allowed" }, { status: 400 });
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "file_too_large" }, { status: 413 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  const id = randomUUID();
  let filename: string;
  try {
    filename = await savePhoto(buffer, { id, ext });
  } catch {
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }

  let photo: {
    id: string;
    mimeType: string;
    size: number;
    createdAt: Date;
  };
  try {
    photo = await prisma.photo.create({
      data: {
        weddingId: auth.session.weddingId,
        filename,
        mimeType: file.type,
        size: file.size,
        purpose,
      },
      select: { id: true, mimeType: true, size: true, createdAt: true },
    });
  } catch {
    // Avoid leaving an orphan file behind if the DB write fails.
    await deletePhoto(filename).catch(() => {});
    return NextResponse.json({ error: "create_failed" }, { status: 500 });
  }

  return NextResponse.json({ photo: serialize(photo) }, { status: 201 });
}
