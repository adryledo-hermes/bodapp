import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Route-level tests for DELETE /api/account (Profile → danger zone).
 *
 * Covers the two shapes of deletion:
 *   1. last account of the wedding → the whole tenant is wiped (guests,
 *      invitations, photos, tables, tasks, …) so nothing is orphaned;
 *   2. other accounts still exist → only this account goes away and the
 *      shared wedding data survives.
 * Prisma, the session and photo storage are stubbed — no DB, no disk.
 */
const mocks = vi.hoisted(() => {
  const tx = {
    user: { count: vi.fn(), delete: vi.fn() },
    authEmailToken: { deleteMany: vi.fn() },
    photo: { findMany: vi.fn(), deleteMany: vi.fn() },
    otpCode: { deleteMany: vi.fn() },
    guestRelation: { deleteMany: vi.fn() },
    guest: { deleteMany: vi.fn() },
    task: { deleteMany: vi.fn() },
    table: { deleteMany: vi.fn() },
    decoration: { deleteMany: vi.fn() },
    invitationTemplate: { deleteMany: vi.fn() },
    invitation: { deleteMany: vi.fn() },
    wedding: { delete: vi.fn() },
  };
  const prisma = { ...tx, $transaction: vi.fn() };
  const transaction = async (fn: unknown) =>
    typeof fn === "function" ? fn(prisma) : Promise.all(fn as Promise<unknown>[]);
  prisma.$transaction.mockImplementation(transaction);
  return {
    prisma,
    tx,
    transaction,
    getSession: vi.fn(),
    destroySession: vi.fn(),
    deletePhoto: vi.fn(),
  };
});

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/session", () => ({
  getSession: mocks.getSession,
  destroySession: mocks.destroySession,
}));
vi.mock("@/lib/storage", () => ({ deletePhoto: mocks.deletePhoto }));

import { DELETE } from "../../src/app/api/account/route";

const SESSION = { userId: "user-1", weddingId: "wedding-1", role: "couple" };

beforeEach(() => {
  vi.clearAllMocks();
  // clearAllMocks keeps implementations, but re-state them so each test is
  // independent even if a future test overrides them.
  mocks.prisma.$transaction.mockImplementation(mocks.transaction);
  mocks.getSession.mockResolvedValue(SESSION);
  mocks.destroySession.mockResolvedValue(undefined);
  mocks.deletePhoto.mockResolvedValue(undefined);
  mocks.tx.photo.findMany.mockResolvedValue([]);
});

describe("DELETE /api/account", () => {
  it("returns 401 and deletes nothing when there is no session", async () => {
    mocks.getSession.mockResolvedValue(null);

    const res = await DELETE();

    expect(res.status).toBe(401);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.tx.user.delete).not.toHaveBeenCalled();
    expect(mocks.destroySession).not.toHaveBeenCalled();
  });

  it("wipes the whole wedding when it is the last account", async () => {
    mocks.tx.user.count.mockResolvedValue(0); // no other accounts left
    mocks.tx.photo.findMany.mockResolvedValue([{ filename: "a.jpg" }]);

    const res = await DELETE();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, weddingDeleted: true });

    // Children are deleted before their parents (no cascades in the schema),
    // so every FK still resolves while the transaction runs.
    const at = (m: { mock: { invocationCallOrder: number[] } }) =>
      m.mock.invocationCallOrder[0];
    expect(mocks.tx.authEmailToken.deleteMany).toHaveBeenCalled();
    expect(mocks.tx.user.delete).toHaveBeenCalledWith({
      where: { id: SESSION.userId },
    });
    expect(mocks.tx.guestRelation.deleteMany).toHaveBeenCalled();
    expect(mocks.tx.guest.deleteMany).toHaveBeenCalled();
    expect(mocks.tx.invitation.deleteMany).toHaveBeenCalled();
    expect(mocks.tx.wedding.delete).toHaveBeenCalledWith({
      where: { id: SESSION.weddingId },
    });
    expect(at(mocks.tx.authEmailToken.deleteMany)).toBeLessThan(
      at(mocks.tx.user.delete)
    );
    expect(at(mocks.tx.guestRelation.deleteMany)).toBeLessThan(
      at(mocks.tx.guest.deleteMany)
    );
    expect(at(mocks.tx.otpCode.deleteMany)).toBeLessThan(
      at(mocks.tx.invitation.deleteMany)
    );
    expect(at(mocks.tx.guest.deleteMany)).toBeLessThan(
      at(mocks.tx.invitation.deleteMany)
    );
    expect(at(mocks.tx.guest.deleteMany)).toBeLessThan(
      at(mocks.tx.table.deleteMany)
    );
    expect(at(mocks.tx.invitation.deleteMany)).toBeLessThan(
      at(mocks.tx.wedding.delete)
    );

    // The photo file on disk goes away too, and the session is dropped.
    expect(mocks.deletePhoto).toHaveBeenCalledWith("a.jpg");
    expect(mocks.destroySession).toHaveBeenCalledTimes(1);
  });

  it("keeps the wedding data when other accounts still exist", async () => {
    mocks.tx.user.count.mockResolvedValue(1); // partner still has access

    const res = await DELETE();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, weddingDeleted: false });

    // Only this account (and its email tokens) are removed.
    expect(mocks.tx.authEmailToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: SESSION.userId },
    });
    expect(mocks.tx.user.delete).toHaveBeenCalledWith({
      where: { id: SESSION.userId },
    });
    expect(mocks.tx.wedding.delete).not.toHaveBeenCalled();
    expect(mocks.tx.guest.deleteMany).not.toHaveBeenCalled();
    expect(mocks.tx.photo.deleteMany).not.toHaveBeenCalled();

    expect(mocks.destroySession).toHaveBeenCalledTimes(1);
  });

  it("only ever targets the signed-in user, never a request-supplied id", async () => {
    mocks.tx.user.count.mockResolvedValue(1);

    await DELETE();

    // The id comes from the session payload — no parameters are accepted.
    expect(mocks.tx.user.delete).toHaveBeenCalledWith({
      where: { id: SESSION.userId },
    });
    expect(mocks.tx.user.delete).toHaveBeenCalledTimes(1);
  });
});