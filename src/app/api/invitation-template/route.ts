import { NextResponse } from "next/server";
import type * as runtime from "@prisma/client/runtime/client";
import { prisma } from "@/lib/db";
import { requireSession, tenantWhere } from "@/lib/auth-guard";
import { templateSaveSchema } from "@/lib/invitation-schema";
import {
  DEFAULT_TEMPLATE_VERSION,
  incrementVersion,
  normalizeTemplateContent,
} from "@/lib/invitation";

// GET /api/invitation-template — return the wedding's latest published template
// (content + version) plus the couple's bank account from the Wedding row. The
// public invitation (Task 10) consumes this same endpoint, so the shape is kept
// flat and stable: { template: { content, version, publishedAt }, bankAccount }.
export async function GET() {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  const [template, wedding] = await Promise.all([
    prisma.invitationTemplate.findFirst({
      where: tenantWhere(auth.session),
      orderBy: { version: "desc" },
    }),
    prisma.wedding.findUnique({
      where: { id: auth.session.weddingId },
      select: { bankAccount: true },
    }),
  ]);

  return NextResponse.json({
    template: {
      content: normalizeTemplateContent(template?.content),
      version: template?.version ?? DEFAULT_TEMPLATE_VERSION,
      publishedAt: template?.publishedAt ?? null,
    },
    bankAccount: wedding?.bankAccount ?? null,
  });
}

// POST /api/invitation-template — upsert the wedding's latest template and save
// the bank account atomically inside a single transaction: either both the
// Wedding.bankAccount update and the template write commit, or neither does, so
// a failure can never leave a half-saved publish.
//
// Tenant safety: the template write is re-scoped to the session's weddingId *
// on the write itself* (updateMany where { id, weddingId }), not just on the
// read that located the row, so a cross-tenant id can never be updated/created.
// Version semantics: the first publish lands on DEFAULT_TEMPLATE_VERSION (1);
// each subsequent publish bumps the stored version (see FIX note on version).
export async function POST(req: Request) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const parsed = templateSaveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid input", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const content = normalizeTemplateContent(parsed.data.content ?? {});

  const template = await prisma.$transaction(async (tx) => {
    // Persist the bank account on the Wedding (tenant-scoped by session.weddingId).
    if (parsed.data.bankAccount !== undefined) {
      await tx.wedding.update({
        where: { id: auth.session.weddingId },
        data: { bankAccount: parsed.data.bankAccount ?? null },
      });
    }

    const existing = await tx.invitationTemplate.findFirst({
      where: tenantWhere(auth.session),
      orderBy: { version: "desc" },
    });

    // First publish → version 1 (the default). Later publishes bump the stored
    // version: version 1 after the first save, version 2 on the next one.
    const version = existing
      ? incrementVersion(existing.version)
      : DEFAULT_TEMPLATE_VERSION;

    if (existing) {
      // Tenant-check the UPDATE itself: only bump the row if it belongs to the
      // session's wedding — guards against a cross-tenant id from the read.
      const updated = await tx.invitationTemplate.updateMany({
        where: { id: existing.id, weddingId: auth.session.weddingId },
        data: {
          content: content as unknown as runtime.InputJsonValue,
          version,
          publishedAt: new Date(),
        },
      });
      if (updated.count === 0) {
        throw new Error("template not found for this wedding");
      }
      return {
        content,
        version,
        publishedAt: new Date(),
      };
    }

    const created = await tx.invitationTemplate.create({
      data: {
        // weddingId always comes from the session, never from the request body.
        weddingId: auth.session.weddingId,
        content: content as unknown as runtime.InputJsonValue,
        version,
        publishedAt: new Date(),
      },
    });
    return created;
  });

  return NextResponse.json({
    template: {
      content: normalizeTemplateContent(template.content),
      version: template.version,
      publishedAt: template.publishedAt,
    },
    bankAccount: parsed.data.bankAccount ?? null,
  });
}
