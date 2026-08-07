import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { findInvitationByToken } from "@/lib/otp-flow-db";
import { getInvitationAccess } from "@/lib/otp-session";
import { loadPublicInvitationView } from "@/lib/invitation-public-db";
import InvitationPage from "@/components/invite/InvitationPage";
import { getLocale } from "@/lib/locale-server";
import { normalizeLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

interface InvitationRouteProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ g?: string | string[] }>;
}

/**
 * The personalized public invitation (Task 10). Same token resolution as the
 * Task 9 invite page: `?g=` is the Invitation.id and must belong to this
 * wedding's slug or it 404s. On top of that it REQUIRES a valid guest access
 * cookie scoped to exactly this invitation — without one it bounces the guest
 * to the OTP entry (`/w/[slug]/invite`) to authenticate first. The view is
 * built server-side from the wedding's template + bank account + the invitee
 * Guest rows (matched by acceptedPhones), then rendered by the client
 * InvitationPage.
 */
export default async function InvitationRoute({
  params,
  searchParams,
}: InvitationRouteProps) {
  const { slug } = await params;
  const { g } = await searchParams;
  const token = typeof g === "string" ? g : undefined;

  const wedding = await prisma.wedding.findUnique({
    where: { slug },
    select: { id: true, locale: true },
  });
  const invitation = token ? await findInvitationByToken(token) : null;

  if (!wedding || !invitation || invitation.weddingId !== wedding.id) {
    notFound();
  }

  // Public pages default to the wedding's configured locale.
  const locale = await getLocale(normalizeLocale(wedding.locale, "es"));

  // The OTP cookie must be scoped to THIS invitation + wedding; otherwise send
  // the guest back to the OTP entry to authenticate (or re-authenticate).
  const access = await getInvitationAccess();
  const hasAccess =
    access !== null &&
    access.invitationId === invitation.id &&
    access.weddingId === invitation.weddingId;

  if (!hasAccess) {
    redirect(`/w/${slug}/invite?g=${encodeURIComponent(invitation.id)}`);
  }

  const view = await loadPublicInvitationView(invitation.id);
  if (!view) notFound();

  return <InvitationPage view={view} locale={locale} />;
}
