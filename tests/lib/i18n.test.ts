import { describe, expect, it } from "vitest";
import {
  messages,
  normalizeLocale,
  plural,
  translate,
  type Locale,
} from "../../src/lib/i18n";

describe("normalizeLocale", () => {
  it("returns es/en for valid inputs", () => {
    expect(normalizeLocale("es")).toBe("es");
    expect(normalizeLocale("en")).toBe("en");
  });

  it("falls back to es for invalid / unknown values", () => {
    expect(normalizeLocale("fr")).toBe("es");
    expect(normalizeLocale("")).toBe("es");
    expect(normalizeLocale("x" as Locale)).toBe("es");
  });

  it("falls back to es for null / undefined", () => {
    expect(normalizeLocale(undefined)).toBe("es");
    expect(normalizeLocale(null)).toBe("es");
  });

  it("respects the provided fallback for unknown values", () => {
    expect(normalizeLocale("fr", "en")).toBe("en");
    expect(normalizeLocale(undefined, "en")).toBe("en");
    expect(normalizeLocale(null, "es")).toBe("es");
  });
});

describe("translate", () => {
  it("returns the Spanish message for the es locale", () => {
    expect(translate("es", "nav.guests")).toBe("Invitados");
  });

  it("returns the English message for the en locale", () => {
    expect(translate("en", "nav.guests")).toBe("Guests");
  });

  it("falls back to the key when the key is unknown", () => {
    expect(translate("es", "missing.key.here")).toBe("missing.key.here");
    expect(translate("en", "missing.key.here")).toBe("missing.key.here");
  });

  it("interpolates {var} placeholders", () => {
    expect(translate("en", "tpl.version", { n: 5 })).toBe("Version 5");
    expect(translate("es", "tpl.version", { n: 7 })).toBe("Versión 7");
  });

  it("always returns es for an unknown locale (translate is safe)", () => {
    expect(translate("fr" as Locale, "nav.mesas")).toBe("Mesas");
  });
});

describe("plural", () => {
  it("selects the singular/plural form by count", () => {
    expect(plural("es", "seating.table", 1)).toBe("mesa");
    expect(plural("es", "seating.table", 3)).toBe("mesas");
    expect(plural("en", "seating.table", 1)).toBe("table");
    expect(plural("en", "seating.table", 5)).toBe("tables");
  });
});

describe("dictionary parity", () => {
  it("has identical key sets across es and en", () => {
    const esKeys = Object.keys(messages.es).sort();
    const enKeys = Object.keys(messages.en).sort();
    expect(enKeys).toEqual(esKeys);
  });

  it("has a non-empty dictionary for both locales", () => {
    expect(Object.keys(messages.es).length).toBeGreaterThan(50);
    expect(Object.keys(messages.en).length).toBeGreaterThan(50);
  });

  it("does not contain empty English strings", () => {
    for (const [key, value] of Object.entries(messages.en)) {
      expect(value.trim().length, `en key "${key}" is empty`).toBeGreaterThan(0);
    }
  });
});
