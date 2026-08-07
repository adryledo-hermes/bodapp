"use client";

import { useMemo, useState } from "react";
import { filterGuests, type GuestCardData, type RsvpStatus } from "@/lib/guest-view";
import GuestCard from "./GuestCard";

const inputClassName =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none";

export default function GuestBoard({ guests }: { guests: GuestCardData[] }) {
  const [search, setSearch] = useState("");
  const [rsvpStatus, setRsvpStatus] = useState<RsvpStatus | "">("");
  const [allergy, setAllergy] = useState("");

  const filtered = useMemo(
    () => filterGuests(guests, { search, rsvpStatus, allergy }),
    [guests, search, rsvpStatus, allergy]
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <input
          type="search"
          placeholder="Buscar por nombre o apodo…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={inputClassName}
          aria-label="Buscar invitados"
        />
        <select
          value={rsvpStatus}
          onChange={(e) => setRsvpStatus(e.target.value as RsvpStatus | "")}
          className={inputClassName}
          aria-label="Filtrar por estado RSVP"
        >
          <option value="">Todos los estados</option>
          <option value="pending">Pendiente</option>
          <option value="confirmed">Confirmado</option>
          <option value="declined">Declinó</option>
          <option value="maybe">Quizás</option>
        </select>
        <input
          type="search"
          placeholder="Filtrar por alergia…"
          value={allergy}
          onChange={(e) => setAllergy(e.target.value)}
          className={inputClassName}
          aria-label="Filtrar por alergia"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">
          No hay invitados que coincidan con la búsqueda.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filtered.map((guest) => (
            <GuestCard key={guest.id} guest={guest} />
          ))}
        </div>
      )}
    </div>
  );
}