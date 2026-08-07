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

// POST /api/invitation-template — upsert the wedding's latest template: persist
// the (normalized) content, bump the version and stamp publishedAt = now. When a
// bank account is supplied it is saved to the Wedding row as part of the same
// publish action. All reads are tenant-scoped; the update targets a row already
// scoped to the session.
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

  // Persist the bank account on the Wedding (tenant-scoped by session.weddingId).
  if (parsed.data.bankAccount !== undefined) {
    await prisma.wedding.update({
      where: { id: auth.session.weddingId },
      data: { bankAccount: parsed.data.bankAccount ?? null },
    });
  }

  const existing = await prisma.invitationTemplate.findFirst({
    where: tenantWhere(auth.session),
    orderBy: { version: "desc" },
  });

  const version = existing
    ? incrementVersion(existing.version)
    : incrementVersion(DEFAULT_TEMPLATE_VERSION);

  const template = existing
    ? await prisma.invitationTemplate.update({
        where: { id: existing.id },
        data: {
          content: content as unknown as runtime.InputJsonValue,
          version,
          publishedAt: new Date(),
        },
      })
    : await prisma.invitationTemplate.create({
        data: {
          weddingId: auth.session.weddingId,
          content: content as unknown as runtime.InputJsonValue,
          version,
          publishedAt: new Date(),
        },
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
