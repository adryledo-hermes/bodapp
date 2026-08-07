import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireSession, tenantWhere } from "@/lib/auth-guard";
import PhotoGallery, { type PhotoItem } from "@/components/photos/PhotoGallery";
import { getLocale } from "@/lib/locale-server";
import { translate } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function FotosPage() {
  const auth = await requireSession();
  if (auth.error) redirect("/login");

  const locale = await getLocale();

  const photos = await prisma.photo.findMany({
    where: tenantWhere(auth.session),
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
