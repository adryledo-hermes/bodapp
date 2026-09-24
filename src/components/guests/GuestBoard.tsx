"use client";

import { useMemo, useState } from "react";
import { filterGuests, type GuestCardData, type RsvpStatus } from "@/lib/guest-view";
import { ALLERGY_OPTIONS } from "@/lib/guests";
import GuestCard from "./GuestCard";
import GuestForm from "./GuestForm";
import GuestEditForm from "./GuestEditForm";
import { translate, type Locale } from "@/lib/i18n";

const inputClassName =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none";

/** Sentinel value for the allergy dropdown's custom free-text entry. */
const ALLERGY_CUSTOM = "__custom__";

export default function GuestBoard({
  guests,
  locale,
}: {
  guests: GuestCardData[];
  locale: Locale;
}) {
  const [search, setSearch] = useState("");
  const [rsvpStatus, setRsvpStatus] = useState<RsvpStatus | "">("");
  // allergySel tracks the selected option ("" = all, a known allergy, or the
  // custom sentinel); allergyCustom holds the free text when "Custom…" is active.
  const [allergySel, setAllergySel] = useState("");
  const [allergyCustom, setAllergyCustom] = useState("");
  const [editing, setEditing] = useState<GuestCardData | null>(null);

  const t = (key: string) => translate(locale, key);

  // The effective allergy filter term: the chosen option, or the free text when
  // the custom entry is selected.
  const allergy = allergySel === ALLERGY_CUSTOM ? allergyCustom : allergySel;

  const filtered = useMemo(
    () => filterGuests(guests, { search, rsvpStatus, allergy }),
    [guests, search, rsvpStatus, allergy]
  );

  const statusOptions: { value: RsvpStatus; key: string }[] = [
    { value: "pending", key: "guest.status.pending" },
    { value: "confirmed", key: "guest.status.confirmed" },
    { value: "declined", key: "guest.status.declined" },
  ];

  return (
    <div className="space-y-6">
      {/* Add-guest form is always available, even with zero guests. */}
      <GuestForm locale={locale} />

      <div className="grid gap-3 sm:grid-cols-3">
        <input
          type="search"
          placeholder={t("guest.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={inputClassName}
          aria-label={t("guest.searchAria")}
        />
        <select
          value={rsvpStatus}
          onChange={(e) => setRsvpStatus(e.target.value as RsvpStatus | "")}
          className={inputClassName}
          aria-label={t("guest.rsvpFilterAria")}
        >
          <option value="">{t("guest.allStatuses")}</option>
          {statusOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {t(o.key)}
            </option>
          ))}
        </select>
        <div>
          <select
            value={allergySel}
            onChange={(e) => setAllergySel(e.target.value)}
            className={inputClassName}
            aria-label={t("guest.allergyAria")}
          >
            <option value="">{t("guest.allAllergies")}</option>
            {ALLERGY_OPTIONS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
            <option value={ALLERGY_CUSTOM}>{t("guest.allergyCustom")}</option>
          </select>
          {allergySel === ALLERGY_CUSTOM && (
            <input
              type="search"
              placeholder={t("guest.allergyPlaceholder")}
              value={allergyCustom}
              onChange={(e) => setAllergyCustom(e.target.value)}
              className={inputClassName}
              aria-label={t("guest.allergyCustom")}
              autoFocus
            />
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">
          {t("guest.empty")}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filtered.map((guest) => (
            <GuestCard
              key={guest.id}
              guest={guest}
              locale={locale}
              onEdit={setEditing}
            />
          ))}
        </div>
      )}

      {editing && (
        <GuestEditForm guest={editing} locale={locale} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}
