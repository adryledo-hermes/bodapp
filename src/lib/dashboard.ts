/**
 * Pure, typed helper that shapes the panel dashboard overview.
 *
 * Kept free of React/Next/Prisma imports so the summary logic is unit-testable
 * with plain hydrated arrays (mirrors src/lib/tasks.ts, src/lib/seating.ts).
 * The dashboard page server component only fetches data and calls
 * `computeDashboardCounts` — no business logic lives in the component.
 */
import { sortTasks, type TaskCategory } from "./tasks";

export type RSVPStatus = "pending" | "confirmed" | "declined";
export type TaskStatus = "todo" | "in_progress" | "done" | "blocked";
export type TaskPriority = "low" | "medium" | "high";

/** Minimum fields the helper needs from each hydrated guest row. */
export interface DashboardGuest {
  rsvpStatus: RSVPStatus | string;
  isChild: boolean;
}

/** Minimum fields the helper needs from each hydrated table row. */
export interface DashboardTable {
  id: string;
}

/**
 * Minimum fields the helper needs from each hydrated invitation row.
 *
 * The Invitation model has NO "sent" column and NO relation to Guest (guests
 * use their own `invitationToken`), so there is no way to know whether the
 * couple "sent" a link. We use OTP-code engagement as the closest proxy: an
 * invitation is considered "sent" once someone has requested a code against it
 * (i.e. a guest opened the link and engaged with it). This is the cleanest
 * realistic signal available from the current schema.
 */
export interface DashboardInvitation {
  id: string;
  /** Number of OTP codes issued against this invitation (engagement). */
  otpCodeCount: number;
}

/** Minimum fields the helper needs from each hydrated task row. */
export interface DashboardTask {
  id: string;
  title: string;
  category: TaskCategory;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | number | Date | null | undefined;
}

export interface DashboardCounts {
  guests: {
    total: number;
    pending: number;
    confirmed: number;
    declined: number;
    adults: number;
    children: number;
  };
  tables: { total: number };
  invitations: { total: number; sent: number; pending: number };
  tasks: {
    total: number;
    done: number;
    pending: number;
    nextTitle: string | null;
    nextDueAt: string | null;
  };
}

/**
 * Summarize the couple's data across subpanels. Pure — takes hydrated arrays
 * and returns a plain summary object.
 *
 * Interpretations (documented):
 * - guests   : counted by rsvpStatus (pending/confirmed/declined).
 * - tables   : total count.
 * - invitations: `sent` = invitation with ≥1 OTP code issued (engagement
 *   proxy; there is no explicit sends-tracking column), `pending` = the rest.
 * - tasks    : `done` = status "done"; `pending` = todo + in_progress + blocked.
 *   `nextTitle`/`nextDueAt` = the first non-done task under the canonical
 *   ordering (due date asc, ties by priority high>medium>low — mirrors
 *   sortTasks), or null when there is no pending task.
 */
export function computeDashboardCounts(
  guestRows: DashboardGuest[],
  tableRows: DashboardTable[],
  invitationRows: DashboardInvitation[],
  taskRows: DashboardTask[]
): DashboardCounts {
  const counts = {
    pending: 0,
    confirmed: 0,
    declined: 0,
  } as Record<RSVPStatus, number>;
  let adults = 0;
  let children = 0;

  for (const g of guestRows) {
    const status = g.rsvpStatus as RSVPStatus;
    if (status in counts) counts[status] += 1;
    if (g.isChild) children += 1;
    else adults += 1;
  }

  const sent = invitationRows.filter((i) => i.otpCodeCount > 0).length;

  const pendingTasks = taskRows.filter((t) => t.status !== "done");
  const done = taskRows.length - pendingTasks.length;

  const orderedPending = sortTasks(pendingTasks);
  const next = orderedPending[0] ?? null;

  const nextDueAt =
    next && next.dueDate != null
      ? typeof next.dueDate === "string"
        ? next.dueDate
        : new Date(next.dueDate).toISOString()
      : null;

  return {
    guests: {
      total: guestRows.length,
      pending: counts.pending,
      confirmed: counts.confirmed,
      declined: counts.declined,
      adults,
      children,
    },
    tables: { total: tableRows.length },
    invitations: {
      total: invitationRows.length,
      sent,
      pending: invitationRows.length - sent,
    },
    tasks: {
      total: taskRows.length,
      done,
      pending: pendingTasks.length,
      nextTitle: next ? next.title : null,
      nextDueAt,
    },
  };
}

/**
 * True when the wedding has no guests AND no tables AND no tasks — used to
 * show a friendly welcome/CTA state instead of an empty grid.
 */
export function isEmpty(
  guestRows: DashboardGuest[],
  tableRows: DashboardTable[],
  taskRows: DashboardTask[]
): boolean {
  return guestRows.length === 0 && tableRows.length === 0 && taskRows.length === 0;
}
