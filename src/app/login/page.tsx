import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import LoginForm from "@/components/auth/LoginForm";

export const dynamic = "force-dynamic";

/**
 * Login page.
 *
 * Server wrapper around the client LoginForm: if the visitor is ALREADY
 * authenticated (a valid session cookie is present), they're sent straight to
 * the panel instead of being shown the login form again.
 */
export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect("/panel");

  return <LoginForm />;
}