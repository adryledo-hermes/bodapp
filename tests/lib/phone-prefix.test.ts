import { describe, expect, it } from "vitest";
import {
  dialCodeForRegion,
  splitPhone,
  joinPhone,
  DEFAULT_DIAL_CODE,
} from "@/lib/phone-prefix";

describe("dialCodeForRegion", () => {
  it("maps a region tag to its dial code", () => {
    expect(dialCodeForRegion("es")).toBe("+34");
    expect(dialCodeForRegion("ES")).toBe("+34");
    expect(dialCodeForRegion("es-ES")).toBe("+34");
    expect(dialCodeForRegion("en-US")).toBe("+1");
    expect(dialCodeForRegion("fr-FR")).toBe("+33");
    expect(dialCodeForRegion("mx")).toBe("+52");
  });

  it("falls back to the default for unknown regions", () => {
    expect(dialCodeForRegion("xx-XX")).toBe(DEFAULT_DIAL_CODE);
    expect(dialCodeForRegion(null)).toBe(DEFAULT_DIAL_CODE);
    expect(dialCodeForRegion("")).toBe(DEFAULT_DIAL_CODE);
  });
});

describe("splitPhone", () => {
  it("splits a prefixed stored phone into prefix + number", () => {
    expect(splitPhone("+34 600 000 000")).toEqual({
      prefix: "+34",
      number: "600 000 000",
    });
    expect(splitPhone("+34600000000")).toEqual({
      prefix: "+34",
      number: "600000000",
    });
    expect(splitPhone("+1 202 555 0199")).toEqual({
      prefix: "+1",
      number: "202 555 0199",
    });
  });

  it("returns the whole thing as number when there is no +", () => {
    expect(splitPhone("600 000 000")).toEqual({
      prefix: "",
      number: "600 000 000",
    });
  });

  it("handles empty input", () => {
    expect(splitPhone("")).toEqual({ prefix: "", number: "" });
    expect(splitPhone(null)).toEqual({ prefix: "", number: "" });
  });
});

describe("joinPhone", () => {
  it("joins prefix and number into stored form", () => {
    expect(joinPhone("+34", "600 000 000")).toBe("+34 600000000");
    expect(joinPhone("34", "600000000")).toBe("+34 600000000");
    expect(joinPhone("+1", "202 555 0199")).toBe("+1 2025550199");
  });

  it("is empty when both parts are empty", () => {
    expect(joinPhone("", "")).toBe("");
    expect(joinPhone("+34", "")).toBe("");
    expect(joinPhone("", "600")).toBe("600");
  });
});