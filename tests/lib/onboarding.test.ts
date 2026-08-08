import { describe, expect, it } from "vitest";
import {
  applySlugDefaults,
  normalizeSlug,
  onboardingSchema,
  slugFromNames,
} from "../../src/lib/onboarding";

describe("normalizeSlug", () => {
  it("lowercases, trims, and collapses whitespace/punctuation runs to a single hyphen", () => {
    expect(normalizeSlug("Adrián & Aitana")).toBe("adrian-aitana");
    expect(normalizeSlug("  HOLA  Mundo!! ")).toBe("hola-mundo");
  });

  it("returns 'boda' for empty or punctuation-only input", () => {
    expect(normalizeSlug("")).toBe("boda");
    expect(normalizeSlug("/")).toBe("boda");
    expect(normalizeSlug("!!!")).toBe("boda");
  });

  it("keeps existing single hyphens", () => {
    expect(normalizeSlug("a-b")).toBe("a-b");
  });

  it("strips accents (diacritics)", () => {
    expect(normalizeSlug("café")).toBe("cafe");
    expect(normalizeSlug("Mañana")).toBe("manana");
  });
});

describe("slugFromNames", () => {
  it("joins two normalized couple names with a hyphen", () => {
    expect(slugFromNames("Adrián", "Aitana")).toBe("adrian-aitana");
  });

  it("falls back to 'boda' when both names are only punctuation", () => {
    expect(slugFromNames("!!", "???")).toBe("boda");
  });
});

describe("onboardingSchema", () => {
  const valid = {
    coupleNameA: "Adrián",
    coupleNameB: "Aitana",
    email: "adrian@example.com",
    password: "supersecret",
  };

  it("accepts a valid payload (plus optional slug/locale)", () => {
    const parsed = onboardingSchema.parse({
      ...valid,
      slug: "Nuestra-Boda",
      locale: "en",
    });
    expect(parsed.coupleNameA).toBe("Adrián");
    expect(parsed.slug).toBe("Nuestra-Boda");
    expect(parsed.locale).toBe("en");
  });

  it("rejects a password shorter than 8 chars", () => {
    expect(onboardingSchema.safeParse({ ...valid, password: "short" }).success).toBe(false);
  });

  it("rejects a bad email", () => {
    expect(
      onboardingSchema.safeParse({ ...valid, email: "not-an-email" }).success
    ).toBe(false);
  });

  it("rejects names shorter than 2 chars after trimming", () => {
    expect(onboardingSchema.safeParse({ ...valid, coupleNameA: " A " }).success).toBe(false);
  });

  it("defaults locale to 'es' when omitted", () => {
    const parsed = onboardingSchema.parse(valid);
    expect(parsed.locale).toBe("es");
  });

  it("rejects an invalid locale", () => {
    expect(
      onboardingSchema.safeParse({ ...valid, locale: "fr" }).success
    ).toBe(false);
  });
});

describe("applySlugDefaults", () => {
  it("uses the provided slug when present (normalized)", () => {
    const out = applySlugDefaults({
      coupleNameA: "Adrián",
      coupleNameB: "Aitana",
      slug: " Mi Boda!! ",
    });
    expect(out.slug).toBe("mi-boda");
  });

  it("derives the slug from names when absent", () => {
    const out = applySlugDefaults({
      coupleNameA: "Adrián",
      coupleNameB: "Aitana",
    });
    expect(out.slug).toBe("adrian-aitana");
  });

  it("spreads through the rest of the input unchanged", () => {
    const out = applySlugDefaults({
      coupleNameA: "A",
      coupleNameB: "B",
      email: "x@y.com",
      locale: "es",
    });
    expect(out.email).toBe("x@y.com");
  });
});