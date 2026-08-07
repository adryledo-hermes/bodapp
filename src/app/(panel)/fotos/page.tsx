import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireSession, tenantWhere } from "@/lib/auth-guard";
import PhotoGallery, { type PhotoItem } from "@/components/photos/PhotoGallery";

export const dynamic = "force-dynamic";

export default async function FotosPage() {
  const auth = await requireSession();
  if (auth.error) redirect("/login");

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
    <main className="mx-auto max-w-6xl p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Fotos</h1>
        <p className="text-sm text-slate-500">
          Sube las fotos de la pareja (compromiso, boda…) para mostrarlas en la
          galería.
        </p>
      </header>
      <PhotoGallery photos={rows} />
    </main>
  );
}
