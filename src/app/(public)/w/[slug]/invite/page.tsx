import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { findInvitationByToken } from "@/lib/otp-flow-db";
import { getInvitationAccess } from "@/lib/otp-session";
import OtpChallenge from "@/components/invite/OtpChallenge";

export const dynamic = "force-dynamic";

interface InvitePageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ g?: string | string[] }>;
}

/**
 * Public guest invitation page (Task 9). The token comes from the `g` query
 * param (the Invitation.id). A genuine invitation shows the OTP form (or the
 * access-confirmation when a valid `invitation_access` cookie is present); a
 * bogus token that doesn't resolve to an invitation for this wedding 404s.
 */
export default async function InvitePage({
  params,
  searchParams,
}: InvitePageProps) {
  const { slug } = await params;
  const { g } = await searchParams;
  const token = typeof g === "string" ? g : undefined;

  // No token, or the token doesn't resolve to an invitation for this wedding:
  // treat both as "not found" so we never reveal invitation existence.
  const wedding = await prisma.wedding.findUnique({
    where: { slug },
    select: { id: true, coupleNameA: true, coupleNameB: true },
  });
  const invitation = token ? await findInvitationByToken(token) : null;

  if (
    !wedding ||
    !invitation ||
    invitation.weddingId !== wedding.id
  ) {
    notFound();
  }

  const access = await getInvitationAccess();
  const hasAccess =
    access !== null &&
    access.invitationId === invitation.id &&
    access.weddingId === invitation.weddingId;

  const coupleNames = [wedding.coupleNameA, wedding.coupleNameB]
    .filter(Boolean)
    .join(" & ");

  return (
    <main className="flex min-h-[80vh] flex-col items-center justify-center bg-gradient-to-b from-slate-50 to-rose-50 p-6">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
        <h1 className="text-3xl font-semibold text-slate-900">
          {coupleNames || "Nuestra boda"}
        </h1>
        <p className="mt-2 text-slate-500">Bodapp · Invitación</p>

        {hasAccess ? (
          <div className="mt-8 flex flex-col items-center gap-3">
            <span className="text-4xl">✔</span>
            <p className="text-lg font-medium text-slate-900">
              Tienes acceso a tu invitación
            </p>
            <p className="text-sm text-slate-500">
              En breve podrás ver los detalles y confirmar tu asistencia.
            </p>
            <Link
              href={`/w/${slug}/invitation?g=${encodeURIComponent(invitation.id)}`}
              className="mt-2 rounded-lg bg-slate-900 px-6 py-2 text-sm font-medium text-white hover:bg-slate-700"
            >
              Ver mi invitación
            </Link>
          </div>
        ) : (
          <div className="mt-8">
            <p className="mb-6 text-sm text-slate-500">
              Para ver tu invitación, confirma tu número de teléfono para
              recibir un código por SMS.
            </p>
            <OtpChallenge token={invitation.id} />
          </div>
        )}
      </div>
    </main>
  );
}
