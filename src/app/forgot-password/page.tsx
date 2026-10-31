import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import ForgotPasswordForm from "@/components/auth/ForgotPasswordForm";

export const dynamic = "force-dynamic";

/**
 * "Forgot password" page — the recovery entry point linked from /login.
 * Anyone already signed in has nothing to recover, so they go to the panel.
 */
export default async function ForgotPasswordPage() {
  const session = await getSession();
  if (session) redirect("/panel");

  return <ForgotPasswordForm />;
}