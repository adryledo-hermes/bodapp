import { describe, expect, it } from "vitest";
import {
  computeDashboardCounts,
  isEmpty,
  type DashboardGuest,
  type DashboardInvitation,
  type DashboardTable,
  type DashboardTask,
} from "../../src/lib/dashboard";

const guests = (
  rows: Array<Partial<DashboardGuest> & { rsvpStatus: string; isChild?: boolean }>
): DashboardGuest[] =>
  rows.map((g) => ({ rsvpStatus: g.rsvpStatus, isChild: g.isChild ?? false }));

const tables = (n: number): DashboardTable[] =>
  Array.from({ length: n }, (_, i) => ({ id: `t${i}` }));

const invitations = (
  rows: Array<{ otpCodeCount?: number }>
): DashboardInvitation[] =>
  rows.map((r, i) => ({ id: `inv${i}`, otpCodeCount: r.otpCodeCount ?? 0 }));

const tasks = (
  rows: Array<{
    status?: string;
    title?: string;
    priority?: string;
    category?: string;
    dueDate?: string | null;
  }>
): DashboardTask[] =>
  rows.map((r, i) => ({
    id: `tsk${i}`,
    title: r.title ?? `Tarea ${i}`,
    category: (r.category ?? "vendors") as DashboardTask["category"],
    status: (r.status ?? "todo") as DashboardTask["status"],
    priority: (r.priority ?? "medium") as DashboardTask["priority"],
    dueDate: r.dueDate ?? null,
  })) as DashboardTask[];

describe("computeDashboardCounts — guests", () => {
  const g = guests([
    { rsvpStatus: "confirmed" },
    { rsvpStatus: "confirmed" },
    { rsvpStatus: "pending" },
    { rsvpStatus: "pending" },
    { rsvpStatus: "pending" },
    { rsvpStatus: "declined" },
    { rsvpStatus: "pending" }, // was 'maybe', migrated to 'pending'
  ]);

  it("counts guests by rsvpStatus and total", () => {
    const { guests: res } = computeDashboardCounts(g, [], [], []);
    expect(res.total).toBe(7);
    expect(res.pending).toBe(4);
    expect(res.confirmed).toBe(2);
    expect(res.declined).toBe(1);
    expect(res.adults).toBe(7);
    expect(res.children).toBe(0);
  });

  it("returns zeroed counts for an empty guest list", () => {
    const { guests: res } = computeDashboardCounts([], [], [], []);
    expect(res).toEqual({ total: 0, pending: 0, confirmed: 0, declined: 0, adults: 0, children: 0 });
  });
});

describe("computeDashboardCounts — tables", () => {
  it("counts tables", () => {
    const { tables: res } = computeDashboardCounts([], tables(4), [], []);
    expect(res.total).toBe(4);
  });
});

describe("computeDashboardCounts — invitations (sent/pending)", () => {
  it("treats an invitation with ≥1 OTP code as sent, the rest as pending", () => {
    const invs = invitations([
      { otpCodeCount: 3 }, // engaged -> sent
      { otpCodeCount: 0 }, // not engaged -> pending
      { otpCodeCount: 1 }, // engaged -> sent
    ]);
    const { invitations: res } = computeDashboardCounts([], [], invs, []);
    expect(res.total).toBe(3);
    expect(res.sent).toBe(2);
    expect(res.pending).toBe(1);
  });

  it("handles an empty invitation list", () => {
    const { invitations: res } = computeDashboardCounts([], [], [], []);
    expect(res).toEqual({ total: 0, sent: 0, pending: 0 });
  });
});

describe("computeDashboardCounts — tasks", () => {
  const ts = tasks([
    { status: "done", title: "Hecho", dueDate: "2026-01-01" },
    { status: "todo", title: "Próxima pronto", priority: "high", dueDate: "2026-02-01" },
    { status: "in_progress", title: "En curso", priority: "medium", dueDate: "2026-02-10" },
    { status: "blocked", title: "Bloqueada", priority: "low", dueDate: null },
  ]);

  it("counts done vs pending (todo + in_progress + blocked)", () => {
    const { tasks: res } = computeDashboardCounts([], [], [], ts);
    expect(res.total).toBe(4);
    expect(res.done).toBe(1);
    expect(res.pending).toBe(3);
  });

  it("picks the soonest-due non-done task as next", () => {
    const { tasks: res } = computeDashboardCounts([], [], [], ts);
    expect(res.nextTitle).toBe("Próxima pronto");
    expect(res.nextDueAt).toBe("2026-02-01");
  });

  it("breaks ties by highest priority among non-done tasks", () => {
    const tie = tasks([
      { status: "todo", title: "Alta", priority: "high", dueDate: "2026-03-01" },
      { status: "todo", title: "Baja", priority: "low", dueDate: "2026-03-01" },
    ]);
    const { tasks: res } = computeDashboardCounts([], [], [], tie);
    expect(res.nextTitle).toBe("Alta");
  });

  it("returns null next task when all tasks are done", () => {
    const allDone = tasks([
      { status: "done", title: "A" },
      { status: "done", title: "B" },
    ]);
    const { tasks: res } = computeDashboardCounts([], [], [], allDone);
    expect(res.done).toBe(2);
    expect(res.pending).toBe(0);
    expect(res.nextTitle).toBeNull();
    expect(res.nextDueAt).toBeNull();
  });

  it("returns null next task for an empty task list", () => {
    const { tasks: res } = computeDashboardCounts([], [], [], []);
    expect(res.nextTitle).toBeNull();
    expect(res.nextDueAt).toBeNull();
  });
});

describe("isEmpty", () => {
  it("is true when there are no guests, tables, or tasks", () => {
    expect(isEmpty([], [], [])).toBe(true);
    expect(isEmpty([], tables(0), [])).toBe(true);
  });

  it("is false when any guest, table, or task exists", () => {
    expect(isEmpty(guests([{ rsvpStatus: "pending" }]), [], [])).toBe(false);
    expect(isEmpty([], tables(1), [])).toBe(false);
    expect(isEmpty([], [], tasks([{ status: "todo" }]))).toBe(false);
  });
});
