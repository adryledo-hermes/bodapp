import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { findInvitationByToken } from "@/lib/otp-flow-db";
import { getInvitationAccess } from "@/lib/otp-session";
import OtpChallenge from "@/components/invite/OtpChallenge";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import { getLocale } from "@/lib/locale-server";
import { normalizeLocale, translate } from "@/lib/i18n";
import { guestOtpBypassEnabled } from "@/lib/guest-access";
import { createInvitationAccess } from "@/lib/otp-session";

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
    select: { id: true, coupleNameA: true, coupleNameB: true, locale: true },
  });
  const invitation = token ? await findInvitationByToken(token) : null;

  if (
    !wedding ||
    !invitation ||
    invitation.weddingId !== wedding.id
  ) {
    notFound();
  }

  // Public pages default to the wedding's configured locale (a guest cookie
  // takes precedence if the guest has already switched language).
  const locale = await getLocale(normalizeLocale(wedding.locale, "es"));
  const t = (key: string) => translate(locale, key);

  const bypassOtp = guestOtpBypassEnabled();
  const access = bypassOtp ? null : await getInvitationAccess();
  const hasAccess =
    bypassOtp ||
    (access !== null &&
      access.invitationId === invitation.id &&
      access.weddingId === invitation.weddingId);

  // In bypass mode, issue the same scoped cookie without OTP so the following
  // navigation to the invitation page uses the normal authenticated path.
  if (bypassOtp) {
    await createInvitationAccess({
      invitationId: invitation.id,
      weddingId: invitation.weddingId,
      // No phone identity exists without OTP; default RSVP ownership to the
      // first phone on the invitation allowlist (the couple can still review
      // the group invitation).
      phone: invitation.acceptedPhones[0] ?? "otp-disabled",
    });
  }

  const coupleNames = [wedding.coupleNameA, wedding.coupleNameB]
    .filter(Boolean)
    .join(" & ");

  return (
    <main className="flex min-h-[80vh] flex-col items-center justify-center bg-gradient-to-b from-slate-50 to-rose-50 p-6">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
        <div className="mb-6 flex justify-end">
          <LocaleSwitcher locale={locale} />
        </div>
        <h1 className="text-3xl font-semibold text-slate-900">
          {coupleNames || t("inv.ours")}
        </h1>
        <p className="mt-2 text-slate-500">{t("inv.bodappTag")}</p>

        {hasAccess ? (
          <div className="mt-8 flex flex-col items-center gap-3">
            <span className="text-4xl">✔</span>
            <p className="text-lg font-medium text-slate-900">
              {t("inv.youHaveAccess")}
            </p>
            <p className="text-sm text-slate-500">{t("inv.accessSoon")}</p>
            <Link
              href={`/w/${slug}/invitation?g=${encodeURIComponent(invitation.id)}`}
              className="tap-min mt-2 inline-flex items-center justify-center rounded-lg bg-slate-900 px-6 py-3 text-sm font-medium text-white hover:bg-slate-700"
            >
              {t("inv.viewInvitation")}
            </Link>
          </div>
        ) : (
          <div className="mt-8">
            <p className="mb-6 text-sm text-slate-500">{t("inv.otpIntro")}</p>
            <OtpChallenge token={invitation.id} locale={locale} />
          </div>
        )}
      </div>
    </main>
  );
}
