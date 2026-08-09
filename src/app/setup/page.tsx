import SetupForm from "@/components/setup/SetupForm";

export const dynamic = "force-dynamic";

/**
 * Open self-registration page for couples (multi-tenant).
 *
 * NOT a one-time gate anymore: any couple can register here at any time and
 * gets their own independent wedding + account (see /api/setup). Each
 * registration creates a separate tenant with its own slug and scoped
 * sessions, so tenants never see each other's data. A logged-in visitor can
 * also register additional couples (e.g. friends) — the new session replaces
 * the previous one, just like signing in.
 */
export default async function SetupPage() {
  return <SetupForm />;
}