import { redirect } from "next/navigation";

// QR codes moved into the Invitations panel (per-invitation detail). The old
// /qr URL redirects so saved links don't break.
export default function QrRedirect() {
  redirect("/invitaciones");
}