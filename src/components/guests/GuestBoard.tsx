"use client";

import { useMemo, useState } from "react";
import { filterGuests, type GuestCardData, type RsvpStatus } from "@/lib/guest-view";
import GuestCard from "./GuestCard";
import GuestForm from "./GuestForm";
import { translate, type Locale } from "@/lib/i18n";

const inputClassName =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none";

export default function GuestBoard({
  guests,
  locale,
}: {
  guests: GuestCardData[];
  locale: Locale;
}) {
  const [search, setSearch] = useState("");
  const [rsvpStatus, setRsvpStatus] = useState<RsvpStatus | "">("");
  const [allergy, setAllergy] = useState("");

  const t = (key: string) => translate(locale, key);

  const filtered = useMemo(
    () => filterGuests(guests, { search, rsvpStatus, allergy }),
    [guests, search, rsvpStatus, allergy]
  );

  const statusOptions: { value: RsvpStatus; key: string }[] = [
    { value: "pending", key: "guest.status.pending" },
    { value: "confirmed", key: "guest.status.confirmed" },
    { value: "declined", key: "guest.status.declined" },
    { value: "maybe", key: "guest.status.maybe" },
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
        <input
          type="search"
          placeholder={t("guest.allergyPlaceholder")}
          value={allergy}
          onChange={(e) => setAllergy(e.target.value)}
          className={inputClassName}
          aria-label={t("guest.allergyAria")}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">
          {t("guest.empty")}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filtered.map((guest) => (
            <GuestCard key={guest.id} guest={guest} locale={locale} />
          ))}
        </div>
      )}
    </div>
  );
}
