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
  // `t` is a plain closure over this render's locale: `translate` is pure, and
  // the fetch effect below keeps its own empty deps (eslint-disable), so a
  // re-render never re-fetches server data and overwrites in-progress edits.
  const t = (key: string, vars?: Record<string, string | number>) =>
    translate(locale, key, vars);
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

  // Account deletion (danger zone): the dialog is the confirmation step —
  // nothing is sent until the user explicitly confirms inside it.
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);

  // Fetch profile from server ONCE (mount). Empty deps = never re-run.
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
  }, []); // eslint-disable-line

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
      setMsg({ kind: "success", text: t("common.saved") });
    } catch {
      setMsg({ kind: "error", text: t("common.error") });
    } finally {
      setSaving(false);
    }
  }

  /** Delete the account; only reachable from the confirmation dialog. */
  async function handleDelete() {
    setDeleting(true);
    setDeleteErr(null);
    try {
      const res = await fetch("/api/account", { method: "DELETE" });
      if (!res.ok) throw new Error();
      // Session cookie was cleared by the API — client-side navigate to the
      // login page, which renders the "account deleted" notice.
      router.push("/login?deleted=1");
    } catch {
      setDeleteErr(t("profile.deleteError"));
      setDeleting(false);
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

      {/* Danger zone — account deletion (always last, visually separated) */}
      <section className="mt-10 rounded-xl border border-red-200 bg-red-50 p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-red-800">{t("profile.dangerZone")}</h2>
        <p className="mt-1 text-sm leading-relaxed text-red-700">
          {t("profile.deleteWarning")}
        </p>
        <button
          onClick={() => {
            setDeleteErr(null);
            setConfirmOpen(true);
          }}
          className="tap-min mt-3 rounded-lg border border-red-600 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-600 hover:text-white"
        >
          {t("profile.deleteAccount")}
        </button>
      </section>

      {/* Confirmation dialog — nothing is deleted until this is confirmed */}
      {confirmOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-account-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          onClick={() => {
            if (!deleting) setConfirmOpen(false);
          }}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="delete-account-title" className="text-base font-semibold text-slate-900">
              {t("profile.deleteTitle")}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              {t("profile.deleteBody")}
            </p>
            {deleteErr && <p className="mt-3 text-sm text-red-600">{deleteErr}</p>}

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                onClick={() => setConfirmOpen(false)}
                disabled={deleting}
                className="tap-min rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="tap-min rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? t("common.saving") : t("profile.deleteConfirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}