"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { translate, type Locale } from "@/lib/i18n";

interface ProfileData {
  coupleNameA: string;
  coupleNameB: string;
  email: string | null;
  venue: string | null;
}

const inputCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none";

export default function ProfileForm({ locale }: { locale: Locale }) {
  const t = (key: string) => translate(locale, key);
  const router = useRouter();

  const [draft, setDraft] = useState<ProfileData>({
    coupleNameA: "",
    coupleNameB: "",
    email: "",
    venue: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/wedding/profile")
      .then((r) => r.json())
      .then((data: ProfileData) => {
        setDraft(data);
        setLoading(false);
      })
      .catch(() => {
        setMsg({ kind: "error", text: t("common.error") });
        setLoading(false);
      });
  }, [t]);

  async function handleSave() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/wedding/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          coupleNameA: draft.coupleNameA.trim(),
          coupleNameB: draft.coupleNameB.trim(),
          email: draft.email?.trim() || null,
          venue: draft.venue?.trim() || null,
        }),
      });
      if (!res.ok) throw new Error();
      router.refresh();
      setMsg({ kind: "success", text: t("common.saved") });
    } catch {
      setMsg({ kind: "error", text: t("common.error") });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-500">{t("common.loading")}</p>;
  }

  const set = (key: keyof ProfileData, value: string) =>
    setDraft((d) => ({ ...d, [key]: value }));

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium text-slate-700">
          {t("profile.coupleNameA")}
          <input className={`mt-1 ${inputCls}`} value={draft.coupleNameA} onChange={(e) => set("coupleNameA", e.target.value)} />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          {t("profile.coupleNameB")}
          <input className={`mt-1 ${inputCls}`} value={draft.coupleNameB} onChange={(e) => set("coupleNameB", e.target.value)} />
        </label>
      </div>

      <label className="block text-sm font-medium text-slate-700">
        {t("profile.email")}
        <input type="email" className={`mt-1 ${inputCls}`} value={draft.email ?? ""} onChange={(e) => set("email", e.target.value)} placeholder="pareja@ejemplo.com" />
      </label>

      <label className="block text-sm font-medium text-slate-700">
        {t("profile.venue")}
        <input className={`mt-1 ${inputCls}`} value={draft.venue ?? ""} onChange={(e) => set("venue", e.target.value)} placeholder="Finca El Paraíso" />
      </label>

      {msg && (
        <p className={`text-sm ${msg.kind === "success" ? "text-green-700" : "text-red-600"}`}>
          {msg.text}
        </p>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className="tap-min rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {saving ? t("common.saving") : t("common.save")}
      </button>
    </div>
  );
}