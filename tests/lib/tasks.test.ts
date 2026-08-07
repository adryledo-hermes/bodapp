import { describe, expect, it } from "vitest";
import {
  TASKS_SEED,
  TASK_PRIORITIES,
  TASK_STATUSES,
  sortTasks,
  type SortableTask,
} from "../../src/lib/tasks";

describe("TASK_STATUSES", () => {
  it("has exactly the four statuses in board order with Spanish labels", () => {
    expect(TASK_STATUSES.map((s) => s.value)).toEqual([
      "todo",
      "in_progress",
      "done",
      "blocked",
    ]);
    expect(TASK_STATUSES[0].label).toBe("Por hacer");
    expect(TASK_STATUSES[1].label).toBe("En curso");
    expect(TASK_STATUSES[2].label).toBe("Hecho");
    expect(TASK_STATUSES[3].label).toBe("Bloqueado");
    // each status carries a tailwind colour class for its column/card
    for (const s of TASK_STATUSES) {
      expect(s.color.length).toBeGreaterThan(0);
    }
  });
});

describe("TASK_PRIORITIES", () => {
  it("has low/medium/high with Spanish labels", () => {
    expect(TASK_PRIORITIES.map((p) => p.value)).toEqual(["low", "medium", "high"]);
    expect(TASK_PRIORITIES[0].label).toBe("Baja");
    expect(TASK_PRIORITIES[1].label).toBe("Media");
    expect(TASK_PRIORITIES[2].label).toBe("Alta");
  });
});

describe("TASKS_SEED", () => {
  it("has at least 20 canonical Spanish checklist tasks", () => {
    expect(TASKS_SEED.length).toBeGreaterThanOrEqual(20);
  });

  it("spans at least the four categories (legal, vendors, timing, gifts)", () => {
    const categories = new Set(TASKS_SEED.map((t) => t.category));
    expect(categories).toContain("legal");
    expect(categories).toContain("vendors");
    expect(categories).toContain("timing");
    expect(categories).toContain("gifts");
  });

  it("contains the canonical checklist highlights", () => {
    const titles = TASKS_SEED.map((t) => t.title.toLowerCase());
    expect(titles).toContain("llamar al juzgado");
    expect(titles).toContain("cita para casarse");
    expect(titles).toContain("contratar catering");
    expect(titles).toContain("reservar fotógrafo/vídeo");
    expect(titles).toContain("cóctel".toLowerCase());
    expect(titles).toContain("crear lista de regalos");
  });

  it("starts every task as 'todo'", () => {
    for (const t of TASKS_SEED) {
      expect(t.status).toBe("todo");
    }
  });
});

describe("sortTasks", () => {
  it("sorts by dueDate ascending with nulls last", () => {
    const tasks: SortableTask[] = [
      { id: "a", title: "l", category: "legal", priority: "high", status: "todo", dueDate: null },
      { id: "b", title: "m", category: "legal", priority: "high", status: "todo", dueDate: "2026-03-10" },
      { id: "c", title: "e", category: "legal", priority: "high", status: "todo", dueDate: "2026-03-01" },
      { id: "d", title: "n", category: "legal", priority: "high", status: "todo", dueDate: null },
    ];
    const sorted = sortTasks(tasks);
    expect(sorted.map((t) => t.id)).toEqual(["c", "b", "a", "d"]);
  });

  it("breaks dueDate ties by priority weight (high > medium > low)", () => {
    const tasks: SortableTask[] = [
      { id: "low", title: "x", category: "legal", priority: "low", status: "todo", dueDate: "2026-03-01" },
      { id: "high", title: "y", category: "legal", priority: "high", status: "todo", dueDate: "2026-03-01" },
      { id: "med", title: "z", category: "legal", priority: "medium", status: "todo", dueDate: "2026-03-01" },
    ];
    const sorted = sortTasks(tasks);
    expect(sorted.map((t) => t.id)).toEqual(["high", "med", "low"]);
  });

  it("does not mutate the input array", () => {
    const tasks: SortableTask[] = [
      { id: "b", title: "x", category: "legal", priority: "low", status: "todo", dueDate: "2026-03-02" },
      { id: "a", title: "y", category: "legal", priority: "low", status: "todo", dueDate: "2026-03-01" },
    ];
    const copy = [...tasks];
    sortTasks(tasks);
    expect(tasks).toEqual(copy);
  });
});
