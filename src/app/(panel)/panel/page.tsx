import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireSession, tenantWhere } from "@/lib/auth-guard";
import { getLocale } from "@/lib/locale-server";
import { translate } from "@/lib/i18n";
import {
  computeDashboardCounts,
  isEmpty,
  type DashboardCounts,
  type DashboardGuest,
  type DashboardInvitation,
  type DashboardTable,
  type DashboardTask,
} from "@/lib/dashboard";
import DashboardView from "@/components/dashboard/DashboardView";

export const dynamic = "force-dynamic";

/**
 * Panel dashboard — the couple's landing page after login. Summarizes guests,
 * tables, invitations and tasks across subpanels. All reads are tenant-scoped.
 */
export default async function DashboardPage() {
  const auth = await requireSession();
  if (auth.error) redirect("/login");

  const locale = await getLocale();

  const where = tenantWhere(auth.session);

  const [guestRows, tableRows, invitationRows, taskRows] = await Promise.all([
    prisma.guest.findMany({
      where,
      select: { rsvpStatus: true },
    }),
    prisma.table.findMany({
      where,
      select: { id: true },
    }),
    prisma.invitation.findMany({
      where,
      select: { id: true, _count: { select: { otpCodes: true } } },
    }),
    prisma.task.findMany({
      where,
      select: {
        id: true,
        title: true,
        category: true,
        status: true,
        priority: true,
        dueDate: true,
      },
    }),
  ]);

  const guests: DashboardGuest[] = guestRows;
  const tables: DashboardTable[] = tableRows;
  const invitations: DashboardInvitation[] = invitationRows.map((inv) => ({
    id: inv.id,
    otpCodeCount: inv._count.otpCodes,
  }));
  const tasks: DashboardTask[] = taskRows;

  const summary: DashboardCounts = computeDashboardCounts(guests, tables, invitations, tasks);
  const nothingYet = isEmpty(guests, tables, tasks);

  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">{translate(locale, "dash.title")}</h1>
        <p className="text-sm text-slate-500">{translate(locale, "dash.subtitle")}</p>
      </header>
      <DashboardView summary={summary} locale={locale} isEmpty={nothingYet} />
    </main>
  );
}
