"use client";

import { translate, type Locale } from "@/lib/i18n";
import type { DashboardCounts } from "@/lib/dashboard";

/**
 * Client dashboard summary grid. Receives a pre-computed `summary` from the
 * server page (via computeDashboardCounts) plus the resolved locale, so all
 * labels are localized and each card links to its subpanel.
 */

interface Stat {
  label: string;
  value: number;
  emphasize?: boolean;
}

function StatRow({ stat }: { stat: Stat }) {
  return (
    <div className="flex items-center justify-between border-t border-slate-100 py-2 first:border-t-0 first:pt-0">
      <span className="text-sm text-slate-500">{stat.label}</span>
      <span
        className={`text-base font-semibold ${
          stat.emphasize ? "text-violet-600" : "text-slate-900"
        }`}
      >
        {stat.value}
      </span>
    </div>
  );
}

function Card({
  href,
  title,
  children,
  accent,
}: {
  href: string;
  title: string;
  children: React.ReactNode;
  accent?: string;
}) {
  return (
    <a
      href={href}
      className="block rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-violet-300 hover:shadow"
    >
      <h2 className={`mb-3 text-sm font-semibold uppercase tracking-wide ${accent ?? "text-slate-500"}`}>
        {title}
      </h2>
      {children}
    </a>
  );
}

function formatDate(locale: Locale, iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(locale === "es" ? "es-ES" : "en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

export default function DashboardView({
  summary,
  locale,
  isEmpty,
}: {
  summary: DashboardCounts;
  locale: Locale;
  isEmpty: boolean;
}) {
  const t = (key: string) => translate(locale, key);

  if (isEmpty) {
    return (
      <div className="mx-auto max-w-xl rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mb-3 text-4xl">💍</div>
        <h2 className="mb-2 text-xl font-bold text-slate-900">{t("dash.emptyTitle")}</h2>
        <p className="mb-5 text-sm text-slate-500">{t("dash.emptyBody")}</p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <a
            href="/guests"
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700"
          >
            {t("dash.goGuests")}
          </a>
          <a
            href="/mesas"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:border-violet-300 hover:text-violet-700"
          >
            {t("dash.goTables")}
          </a>
        </div>
      </div>
    );
  }

  const { guests, tables, invitations, tasks } = summary;

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
      {/* Guests */}
      <Card href="/guests" title={t("dash.guests")} accent="text-violet-600">
        <StatRow stat={{ label: t("dash.guestsTotal"), value: guests.total, emphasize: true }} />
        <StatRow stat={{ label: t("dash.guestsPending"), value: guests.pending }} />
        <StatRow stat={{ label: t("dash.guestsConfirmed"), value: guests.confirmed }} />
        <StatRow stat={{ label: t("dash.guestsDeclined"), value: guests.declined }} />
      </Card>

      {/* Tables */}
      <Card href="/mesas" title={t("dash.tables")} accent="text-emerald-600">
        <div className="flex items-center justify-between border-t border-slate-100 py-2">
          <span className="text-sm text-slate-500">{t("dash.tablesTotal")}</span>
          <span className="text-2xl font-bold text-slate-900">{tables.total}</span>
        </div>
      </Card>

      {/* Invitations */}
      <Card href="/invitacion" title={t("dash.invitations")} accent="text-amber-600">
        <StatRow stat={{ label: t("dash.invitationsTotal"), value: invitations.total, emphasize: true }} />
        <StatRow stat={{ label: t("dash.invitationsSent"), value: invitations.sent }} />
        <StatRow stat={{ label: t("dash.invitationsPending"), value: invitations.pending }} />
      </Card>

      {/* Tasks */}
      <Card href="/tareas" title={t("dash.tasks")} accent="text-blue-600">
        <StatRow stat={{ label: t("dash.tasksTotal"), value: tasks.total, emphasize: true }} />
        <StatRow stat={{ label: t("dash.tasksDone"), value: tasks.done }} />
        <StatRow stat={{ label: t("dash.tasksPending"), value: tasks.pending }} />
        <div className="mt-2 rounded-lg bg-slate-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {t("dash.nextTask")}
          </p>
          {tasks.nextTitle ? (
            <>
              <p className="mt-1 text-sm font-semibold text-slate-900">{tasks.nextTitle}</p>
              {tasks.nextDueAt && (
                <p className="mt-0.5 text-xs text-slate-500">{formatDate(locale, tasks.nextDueAt)}</p>
              )}
            </>
          ) : (
            <p className="mt-1 text-sm text-slate-500">{t("dash.noNextTask")}</p>
          )}
        </div>
      </Card>
    </div>
  );
}
