import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireSession, tenantWhere } from "@/lib/auth-guard";
import PhotoGallery, { type PhotoItem } from "@/components/photos/PhotoGallery";
import { getLocale } from "@/lib/locale-server";
import { translate } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/**
 * The wedding gallery shows ONLY wedding photos — it must NOT include images
 * uploaded for other purposes (guest profile photos, invitation images), even
 * though they share the /api/photos storage. We collect every photo id that is
 * referenced by a Guest.photoUrl or an Invitation.content.imageUrl and exclude
 * them from the gallery.
 */
async function referencedPhotoIds(weddingId: string): Promise<Set<string>> {
  const ids = new Set<string>();
  const addFromUrl = (url: string | null | undefined) => {
    if (!url) return;
    // App-relative photo URLs look like /api/photos/<id>/file
    const m = /^\/api\/photos\/([^/]+)\/file$/.exec(url);
    if (m) ids.add(m[1]);
  };

  const [guests, invitations] = await Promise.all([
    prisma.guest.findMany({
      where: { weddingId },
      select: { photoUrl: true },
    }),
    prisma.invitation.findMany({
      where: { weddingId },
      select: { content: true },
    }),
  ]);

  for (const g of guests) addFromUrl(g.photoUrl);
  for (const inv of invitations) {
    if (inv.content && typeof inv.content === "object") {
      const c = inv.content as Record<string, unknown>;
      addFromUrl(typeof c.imageUrl === "string" ? c.imageUrl : null);
    }
  }
  return ids;
}

export default async function FotosPage() {
  const auth = await requireSession();
  if (auth.error) redirect("/login");

  const locale = await getLocale();

  const referenced = await referencedPhotoIds(auth.session.weddingId);

  const photos = await prisma.photo.findMany({
    where: {
      weddingId: auth.session.weddingId,
      // Only wedding gallery photos — exclude profile/invitation images.
      ...(referenced.size > 0 ? { id: { notIn: [...referenced] } } : {}),
    },
    select: { id: true, mimeType: true, size: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  const rows: PhotoItem[] = photos.map((p) => ({
    id: p.id,
    mimeType: p.mimeType,
    size: p.size,
  }));

  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">
          {translate(locale, "p.fotos.title")}
        </h1>
        <p className="text-sm text-slate-500">
          {translate(locale, "p.fotos.subtitle")}
        </p>
      </header>
      <PhotoGallery photos={rows} locale={locale} />
    </main>
  );
}