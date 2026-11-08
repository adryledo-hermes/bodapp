import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth-guard";
import { errText, logWarn } from "@/lib/failure-log";
import { destroySession } from "@/lib/session";
import { deletePhoto } from "@/lib/storage";

/**
 * DELETE /api/account — delete the signed-in account (Profile → danger zone).
 *
 * The caller can only ever delete THEMSELVES (the id comes from the session,
 * never from the request body), so this endpoint cannot be used to remove
 * somebody else's account.
 *
 * Tenants are normally a single account per wedding (setup creates one
 * wedding + one user). When it is the LAST account, deleting only the user
 * row would orphan the whole wedding (guests, invitations, photos, tables,
 * tasks…) with nobody able to ever sign in again — so the tenant is wiped in
 * the same transaction. If other accounts already exist (multi-account
 * weddings, see the permissions plan), only this account goes away and the
 * shared data survives untouched.
 *
 * Photo FILES live on disk (src/lib/storage), outside the DB transaction —
 * they are removed best-effort afterwards, like DELETE /api/photos/[id] does.
 */
export async function DELETE() {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  const { userId, weddingId } = auth.session;

  const result = await prisma.$transaction(async (tx) => {
    // Other accounts of this wedding? Decides "account only" vs "whole tenant".
    const others = await tx.user.count({
      where: { weddingId, id: { not: userId } },
    });

    // AuthEmailToken has no onDelete rule → clear this user's tokens first.
    await tx.authEmailToken.deleteMany({ where: { userId } });
    await tx.user.delete({ where: { id: userId } });

    if (others > 0) {
      return { weddingDeleted: false, photoFiles: [] as string[] };
    }

    // Last account → wipe the tenant, children before parents (no cascades
    // are declared in the schema, so order is what keeps the FKs happy):
    // otpCode → guestRelation → guest → photos/tables/tasks/… → wedding.
    const photos = await tx.photo.findMany({
      where: { weddingId },
      select: { filename: true },
    });
    await tx.otpCode.deleteMany({ where: { invitation: { weddingId } } });
    await tx.guestRelation.deleteMany({ where: { weddingId } });
    await tx.guest.deleteMany({ where: { weddingId } });
    await tx.photo.deleteMany({ where: { weddingId } });
    await tx.task.deleteMany({ where: { weddingId } });
    await tx.table.deleteMany({ where: { weddingId } });
    await tx.decoration.deleteMany({ where: { weddingId } });
    await tx.invitationTemplate.deleteMany({ where: { weddingId } });
    await tx.invitation.deleteMany({ where: { weddingId } });
    await tx.wedding.delete({ where: { id: weddingId } });

    return { weddingDeleted: true, photoFiles: photos.map((p) => p.filename) };
  });

  // Best effort: the rows are already gone, a stray file is only wasted disk —
  // but a silently failing cleanup would fill the volume over time, so it is
  // logged (the account deletion itself already succeeded).
  await Promise.all(
    result.photoFiles.map((f) =>
      deletePhoto(f).catch((err) =>
        logWarn(
          "account",
          "file_cleanup_failed",
          `stray photo ${f} left after account delete: ${errText(err)}`
        )
      )
    )
  );

  // Drop the cookie so this tab can't keep using the deleted account.
  await destroySession();

  return NextResponse.json({
    ok: true,
    weddingDeleted: result.weddingDeleted,
  });
}