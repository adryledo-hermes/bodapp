import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { createSession } from "@/lib/session";
import { applySlugDefaults, onboardingSchema } from "@/lib/onboarding";

/**
 * First-run onboarding (ONE-TIME, intentionally PUBLIC).
 *
 * This is how the couple provisions the very first wedding + couple account on
 * a fresh deployment — there is no admin and no registered user yet, so the
 * endpoint cannot require a session. It is gated by the user-count check
 * below: as soon as ANY user exists the endpoint is locked forever (403
 * `already_configured`), so it can never be used to add a second tenant or to
 * reset an existing account.
 */
export async function POST(req: Request) {
  try {
    // One-time gate: only works before the first user exists.
    const existingUsers = await prisma.user.count();
    if (existingUsers > 0) {
      return NextResponse.json({ error: "already_configured" }, { status: 403 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "invalid json" }, { status: 400 });
    }

    const parsed = onboardingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid input" }, { status: 400 });
    }

    const { coupleNameA, coupleNameB, email, password, locale } = parsed.data;

    // Derive the URL slug from the couple's names unless one was provided. If
    // that slug is already taken (edge case on a re-seeded DB), append -2, -3,
    // … — chosen over failing so the couple can onboard without having to
    // invent a different name; slugs stay unique because each new one is
    // re-checked against the DB.
    const baseSlug = applySlugDefaults(parsed.data).slug;
    let slug = baseSlug;
    let suffix = 2;
    while (await prisma.wedding.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${suffix}`;
      suffix += 1;
    }

    const passwordHash = await hashPassword(password);

    // Wedding + couple user must be created atomically: never a wedding
    // without its owner account.
    try {
      const created = await prisma.$transaction(async (tx) => {
        const wedding = await tx.wedding.create({
          data: { slug, coupleNameA, coupleNameB, locale },
        });
        const user = await tx.user.create({
          data: { weddingId: wedding.id, email, passwordHash, role: "couple" },
        });
        return { wedding, user };
      });

      // Log the couple straight in — their first stop is the panel.
      await createSession({
        userId: created.user.id,
        weddingId: created.wedding.id,
        role: "couple",
      });

      return NextResponse.json({ ok: true, redirect: "/guests" });
    } catch (err) {
      // P2002 = unique constraint violation on wedding.slug or user.email.
      // This is the DB-level backstop for the one-time gate: two concurrent
      // setup requests can both pass the `user.count() === 0` check (TOCTOU),
      // but only one can insert — the loser lands here. Re-check the gate so
      // the race resolves to the intended, safe error.
      if (
        err &&
        typeof err === "object" &&
        "code" in err &&
        (err as { code?: string }).code === "P2002"
      ) {
        const nowConfigured = await prisma.user.count();
        if (nowConfigured > 0) {
          return NextResponse.json(
            { error: "already_configured" },
            { status: 403 }
          );
        }
        // Fall through: both could still be zero (e.g. slug collision against
        // a pre-seeded demo wedding with no users) → report as slug conflict.
        return NextResponse.json({ error: "slug_conflict" }, { status: 409 });
      }
      throw err; // rethrow — caught by the outer handler → 500, no internals
    }
  } catch (err) {
    console.error("[setup] onboarding failed:", err);
    // Never leak internals to the caller.
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}