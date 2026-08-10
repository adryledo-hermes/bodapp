import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getLocale } from "@/lib/locale-server";
import WelcomeLanding from "@/components/WelcomeLanding";

export const dynamic = "force-dynamic";

/**
 * Welcome screen (/, the landing page).
 *
 * If the visitor already has a valid session they go straight to the dashboard;
 * otherwise they are offered two actions: log in as an existing couple, or
 * register a brand-new couple (which creates its own wedding).
 */
export default async function Home() {
  const session = await getSession();
  if (session) redirect("/panel");

  const locale = await getLocale();
  return <WelcomeLanding locale={locale} />;
}