import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import ResetPasswordForm from "@/components/auth/ResetPasswordForm";

export const dynamic = "force-dynamic";

/**
 * The landing page of the emailed recovery link:
 * `/reset-password?token=…`. The token is handed to the client form verbatim;
 * when it is missing the form refuses to submit instead of hitting the API.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (session) redirect("/panel");

  const params = await searchParams;
  const tokenValue = params.token;
  const token = Array.isArray(tokenValue) ? tokenValue[0] : tokenValue;

  return <ResetPasswordForm token={token ?? ""} />;
}