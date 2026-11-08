import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import LoginForm, { type LoginNotice } from "@/components/auth/LoginForm";

export const dynamic = "force-dynamic";

/**
 * Login page.
 *
 * Server wrapper around the client LoginForm: if the visitor is ALREADY
 * authenticated (a valid session cookie is present), they're sent straight to
 * the panel instead of being shown the login form again.
 *
 * It also forwards the outcome flags written by the account flows:
 * `?verified=1` (validation link OK), `?verified=0` (link invalid/expired),
 * `?reset=1` (password just reset), `?deleted=1` (account deleted from the
 * Profile danger zone) and `?registered=1` (account created, waiting for the
 * confirmation email — the session only starts after that click), so the form
 * can say what happened.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (session) redirect("/panel");

  const params = await searchParams;
  const first = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;

  const notice: LoginNotice | undefined =
    first(params.verified) === "1"
      ? "verified"
      : first(params.verified) === "0"
        ? "linkInvalid"
        : first(params.reset) === "1"
          ? "reset"
          : first(params.deleted) === "1"
            ? "deleted"
            : first(params.registered) === "1"
              ? "registered"
              : undefined;

  return <LoginForm notice={notice} />;
}