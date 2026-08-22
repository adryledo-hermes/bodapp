import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/auth-guard";
import { getLocale } from "@/lib/locale-server";
import { translate } from "@/lib/i18n";
import ProfileForm from "@/components/perfil/ProfileForm";

export const dynamic = "force-dynamic";

export default async function PerfilPage() {
  const auth = await requireSession();
  if (auth.error) redirect("/login");

  const locale = await getLocale();
  const t = (key: string) => translate(locale, key);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">{t("p.perfil.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("p.perfil.subtitle")}</p>
      </div>
      <ProfileForm locale={locale} />
    </div>
  );
}