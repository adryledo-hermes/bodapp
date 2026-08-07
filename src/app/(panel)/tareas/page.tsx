import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireSession, tenantWhere } from "@/lib/auth-guard";
import TaskBoard from "@/components/tasks/TaskBoard";
import type { TaskCardData, TaskCategory, TaskPriority, TaskStatus } from "@/lib/tasks";

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

  const tasks = await prisma.task.findMany({
    where: tenantWhere(auth.session),
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="mx-auto max-w-7xl p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Tareas</h1>
        <p className="text-sm text-slate-500">
          Organiza las tareas de la boda en un tablero Kanban. Arrastra cada
          tarjeta entre columnas para cambiar su estado, añade tus propias
          tareas o carga la checklist de boda con un clic.
        </p>
      </header>
      <TaskBoard initialTasks={tasks.map(toCard)} />
    </main>
  );
}
