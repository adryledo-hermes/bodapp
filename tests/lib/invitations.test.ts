import { describe, expect, it } from "vitest";
import { buildAcceptedPhones } from "../../src/lib/invitations";

describe("buildAcceptedPhones", () => {
  it("collects each guest's phone in guest order", () => {
    const guests = [
      { id: "g1", fullName: "Ana", phone: "+34611111111" },
      { id: "g2", fullName: "Luis", phone: "+34622222222" },
    ];
    expect(buildAcceptedPhones(guests)).toEqual([
      "+34611111111",
      "+34622222222",
    ]);
  });

  it("dedupes phones (a couple sharing a phone gets one entry)", () => {
    const guests = [
      { id: "g1", fullName: "Ana", phone: "+34611111111" },
      { id: "g2", fullName: "Luis", phone: "+34611111111" },
      { id: "g3", fullName: "Rosa", phone: "+34633333333" },
    ];
    expect(buildAcceptedPhones(guests)).toEqual([
      "+34611111111",
      "+34633333333",
    ]);
  });

  it("skips empty/whitespace phones and trims values", () => {
    const guests = [
      { id: "g1", fullName: "Ana", phone: "  +34611111111  " },
      { id: "g2", fullName: "Luis", phone: "" },
      { id: "g3", fullName: "Rosa", phone: "   " },
    ];
    expect(buildAcceptedPhones(guests)).toEqual(["+34611111111"]);
  });

  it("returns an empty list for no guests", () => {
    expect(buildAcceptedPhones([])).toEqual([]);
  });
});