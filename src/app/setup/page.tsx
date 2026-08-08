import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import SetupForm from "@/components/setup/SetupForm";

export const dynamic = "force-dynamic";

/**
 * First-run onboarding page (ONE-TIME).
 *
 * The couple provisions their wedding here on a fresh deployment. Once ANY
 * user exists the page redirects to /login (and the setup API 403s), so it
 * can never be used to add tenants or reset accounts.
 */
export default async function SetupPage() {
  // Already logged in? Straight to the panel.
  const session = await getSession();
  if (session) redirect("/guests");

  // Already configured? The couple signs in through the normal flow.
  const existingUsers = await prisma.user.count();
  if (existingUsers > 0) redirect("/login");

  return <SetupForm />;
}