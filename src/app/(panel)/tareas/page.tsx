import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireSession, tenantWhere } from "@/lib/auth-guard";
import TaskBoard from "@/components/tasks/TaskBoard";
import type { TaskCardData, TaskCategory, TaskPriority, TaskStatus } from "@/lib/tasks";
import { getLocale } from "@/lib/locale-server";
import { translate } from "@/lib/i18n";

export const dynamic = "force-dynamic";

function toCard(t: {
  id: string;
  title: string;
  description: string | null;
  category: TaskCategory;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: Date | null;
  assigneeId: string | null;
  notes: string | null;
  createdAt: Date;
}): TaskCardData {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    category: t.category,
    priority: t.priority,
    status: t.status,
    dueDate: t.dueDate ? t.dueDate.toISOString() : null,
    assigneeId: t.assigneeId,
    notes: t.notes,
    createdAt: t.createdAt.toISOString(),
  };
}

export default async function TareasPage() {
  const auth = await requireSession();
  if (auth.error) redirect("/login");

  const locale = await getLocale();

  const tasks = await prisma.task.findMany({
    where: tenantWhere(auth.session),
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="mx-auto max-w-7xl p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">
          {translate(locale, "p.tareas.title")}
        </h1>
        <p className="text-sm text-slate-500">
          {translate(locale, "p.tareas.subtitle")}
        </p>
      </header>
      <TaskBoard initialTasks={tasks.map(toCard)} locale={locale} />
    </main>
  );
}
