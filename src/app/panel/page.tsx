import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * /panel alias.
 *
 * The panel pages live under the (panel) route group (/guests, /tareas, …),
 * so a bare /panel would 404. This top-level alias sends it to the guests
 * page, which is where the auth guard lives (unauthenticated visitors are
 * bounced to /login there).
 */
export default function PanelAliasPage() {
  redirect("/guests");
}