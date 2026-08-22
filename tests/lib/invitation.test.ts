import { describe, expect, it } from "vitest";
import {
  DEFAULT_TEMPLATE,
  DEFAULT_TEMPLATE_VERSION,
  incrementVersion,
  isValidHexColor,
  normalizeTemplateContent,
} from "../../src/lib/invitation";

describe("DEFAULT_TEMPLATE", () => {
  it("has the expected top-level content keys", () => {
    expect(DEFAULT_TEMPLATE).toHaveProperty("titleA");
    expect(DEFAULT_TEMPLATE).toHaveProperty("titleB");
    expect(DEFAULT_TEMPLATE).toHaveProperty("message");
    expect(DEFAULT_TEMPLATE).toHaveProperty("date");
    expect(DEFAULT_TEMPLATE).toHaveProperty("time");
    expect(DEFAULT_TEMPLATE).toHaveProperty("venue");
    expect(DEFAULT_TEMPLATE).toHaveProperty("dressCode");
    expect(DEFAULT_TEMPLATE).toHaveProperty("bankAccount");
    expect(DEFAULT_TEMPLATE).toHaveProperty("sections");
    expect(DEFAULT_TEMPLATE).toHaveProperty("colors");
  });

  it("colors carries primary and accent strings", () => {
    expect(typeof DEFAULT_TEMPLATE.colors.primary).toBe("string");
    expect(typeof DEFAULT_TEMPLATE.colors.accent).toBe("string");
  });

  it("message defaults to empty (names/venue come from Wedding row)", () => {
    expect(DEFAULT_TEMPLATE.message).toBe("");
  });
});

describe("DEFAULT_TEMPLATE_VERSION", () => {
  it("is 1", () => {
    expect(DEFAULT_TEMPLATE_VERSION).toBe(1);
  });
});

describe("normalizeTemplateContent", () => {
  it("fills all defaults when passed an empty object", () => {
    expect(normalizeTemplateContent({})).toEqual(DEFAULT_TEMPLATE);
  });

  it("fills all defaults for null/undefined input", () => {
    expect(normalizeTemplateContent(null)).toEqual(DEFAULT_TEMPLATE);
    expect(normalizeTemplateContent(undefined)).toEqual(DEFAULT_TEMPLATE);
  });

  it("does not clobber set values", () => {
    const norm = normalizeTemplateContent({
      titleA: "Ana",
      titleB: "Luis",
      message: "¡Venid!",
      colors: { primary: "#112233" },
      sections: ["Ceremonia", "Banquete"],
    });
    expect(norm.titleA).toBe("Ana");
    expect(norm.titleB).toBe("Luis");
    expect(norm.message).toBe("¡Venid!");
    expect(norm.colors.primary).toBe("#112233");
    expect(norm.colors.accent).toBe(DEFAULT_TEMPLATE.colors.accent);
    expect(norm.date).toBe(DEFAULT_TEMPLATE.date);
    expect(norm.sections).toEqual(["Ceremonia", "Banquete"]);
  });

  it("is safe for unknown input — non-string fields fall back to defaults", () => {
    const norm = normalizeTemplateContent({
      titleA: 42,
      date: null,
      sections: ["ok", 7, "also ok", null],
    });
    expect(norm.titleA).toBe(DEFAULT_TEMPLATE.titleA);
    expect(norm.date).toBe(DEFAULT_TEMPLATE.date);
    expect(norm.sections).toEqual(["ok", "also ok"]);
  });

  it("does not mutate the input object", () => {
    const input = { titleA: "Ana" };
    normalizeTemplateContent(input);
    expect(input).toEqual({ titleA: "Ana" });
  });
});

describe("incrementVersion", () => {
  it("returns v+1", () => {
    expect(incrementVersion(1)).toBe(2);
    expect(incrementVersion(5)).toBe(6);
  });
});

describe("isValidHexColor", () => {
  it("accepts 3, 6 and 8-digit hex colors", () => {
    expect(isValidHexColor("#ABC")).toBe(true);
    expect(isValidHexColor("#a1b2c3")).toBe(true);
    expect(isValidHexColor("#A1B2C3FF")).toBe(true);
  });

  it("accepts an empty string (no color)", () => {
    expect(isValidHexColor("")).toBe(true);
  });

  it("rejects non-hex values that could inject CSS", () => {
    expect(isValidHexColor("red")).toBe(false);
    expect(isValidHexColor("#12345")).toBe(false);
    expect(isValidHexColor("url(http://evil.test/x.png)")).toBe(false);
    expect(
      isValidHexColor("#fff; background-image: url(http://evil.test/x.png)")
    ).toBe(false);
  });
});
