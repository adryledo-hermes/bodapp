import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth-guard";
import { weddingBankSchema } from "@/lib/invitation-schema";

// PATCH /api/wedding — update the couple's bank account. Scoped to the session's
// wedding (id comes from the session, never from the request body), so a caller
// can never touch another tenant's row.
export async function PATCH(req: Request) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const parsed = weddingBankSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid input", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const wedding = await prisma.wedding.update({
    where: { id: auth.session.weddingId },
    data: { bankAccount: parsed.data.bankAccount ?? null },
  });

  return NextResponse.json({ bankAccount: wedding.bankAccount });
}
