import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireSession, tenantWhere } from "@/lib/auth-guard";
import TemplateEditor from "@/components/invitation/TemplateEditor";
import {
  DEFAULT_TEMPLATE_VERSION,
  normalizeTemplateContent,
} from "@/lib/invitation";

export const dynamic = "force-dynamic";

export default async function InvitacionPage() {
  const auth = await requireSession();
  if (auth.error) redirect("/login");

  const [template, wedding] = await Promise.all([
    prisma.invitationTemplate.findFirst({
      where: tenantWhere(auth.session),
      orderBy: { version: "desc" },
    }),
    prisma.wedding.findUnique({
      where: { id: auth.session.weddingId },
      select: { bankAccount: true },
    }),
  ]);

  const content = normalizeTemplateContent(template?.content);

  return (
    <main className="mx-auto max-w-7xl p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Invitación</h1>
        <p className="text-sm text-slate-500">
          Personaliza el texto y los colores de vuestra invitación y añade
          vuestra cuenta bancaria para los regalos. Cada vez que publiques se
          creará una nueva versión de la plantilla.
        </p>
      </header>
      <TemplateEditor
        initialContent={content}
        initialVersion={template?.version ?? DEFAULT_TEMPLATE_VERSION}
        initialBankAccount={wedding?.bankAccount ?? ""}
      />
    </main>
  );
}
