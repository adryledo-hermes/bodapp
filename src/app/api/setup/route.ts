import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { createSession } from "@/lib/session";
import { applySlugDefaults, onboardingSchema } from "@/lib/onboarding";

/**
 * Open self-registration for couples (intentionally PUBLIC, multi-tenant).
 *
 * Any couple can provision their own wedding + account here at any time —
 * this is no longer the first-run one-time gate. Every successful call
 * creates an INDEPENDENT tenant: its own Wedding row (unique slug) and its
 * own couple User row, then logs that couple straight in. Sessions and all
 * panel queries are scoped to the created weddingId, so tenants can never
 * read each other's data.
 *
 * SECURITY: because the endpoint is open, anyone who can reach it can create
 * a wedding + account. Each one is independent (no cross-tenant access), but
 * this trade-off is intentional for the self-registration use case.
 */
export async function POST(req: Request) {
  try {
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
    // that slug is already taken, append -2, -3, … — chosen over failing so
    // the couple can onboard without having to invent a different name; slugs
    // stay unique because each new one is re-checked against the DB.
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
      // P2002 = unique constraint violation. The slug-dedup loop above covers
      // the common case, but a concurrent request can still race us to the
      // DB — this is the backstop. Distinguish what collided via meta.target
      // (wedding.slug → slug_conflict, user.email → email_exists). Never a
      // 403: the endpoint stays open for other couples (multi-tenant).
      if (
        err &&
        typeof err === "object" &&
        "code" in err &&
        (err as { code?: string }).code === "P2002"
      ) {
        const target = (err as { meta?: { target?: unknown } }).meta?.target;
        const targetStr = Array.isArray(target)
          ? target.join(",")
          : String(target ?? "");
        if (targetStr.includes("email")) {
          return NextResponse.json({ error: "email_exists" }, { status: 409 });
        }
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