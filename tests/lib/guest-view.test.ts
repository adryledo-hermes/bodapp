import { describe, expect, it } from "vitest";
import { filterGuests, type GuestCardData } from "../../src/lib/guest-view";

function makeGuest(overrides: Partial<GuestCardData> = {}): GuestCardData {
  return {
    id: "g1",
    fullName: "María García",
    alias: null,
    relationshipContext: null,
    phone: "+34611223344",
    allergies: [],
    musicPrefs: [],
    paperInvitation: false,
    plusOneAllowed: false,
    plusOneName: null,
    rsvpStatus: "pending",
    notes: null,
    table: null,
    ...overrides,
  };
}

const guests: GuestCardData[] = [
  makeGuest({
    id: "g1",
    fullName: "María García",
    alias: "Mari",
    rsvpStatus: "confirmed",
    allergies: ["frutos secos"],
    musicPrefs: ["rock", "pop"],
  }),
  makeGuest({
    id: "g2",
    fullName: "Juan Pérez",
    alias: null,
    rsvpStatus: "pending",
    allergies: ["gluten"],
    musicPrefs: ["cumbia"],
  }),
  makeGuest({
    id: "g3",
    fullName: "Ana López",
    alias: "Anita",
    rsvpStatus: "declined",
    allergies: [],
    musicPrefs: [],
  }),
];

describe("filterGuests", () => {
  it("returns all guests with no filters", () => {
    expect(filterGuests(guests, {})).toHaveLength(3);
  });

  it("searches by fullName case-insensitively", () => {
    expect(filterGuests(guests, { search: "maria" })).toEqual([guests[0]]);
  });

  it("searches by alias", () => {
    expect(filterGuests(guests, { search: "anita" })).toEqual([guests[2]]);
  });

  it("filters by rsvpStatus exactly", () => {
    expect(filterGuests(guests, { rsvpStatus: "confirmed" })).toEqual([
      guests[0],
    ]);
  });

  it("treats empty rsvpStatus as no filter", () => {
    expect(filterGuests(guests, { rsvpStatus: "" })).toHaveLength(3);
  });

  it("filters by allergy term case-insensitively", () => {
    expect(filterGuests(guests, { allergy: "GLUTEN" })).toEqual([guests[1]]);
  });

  it("combines search + rsvp + allergy", () => {
    const result = filterGuests(guests, {
      search: "a",
      rsvpStatus: "confirmed",
      allergy: "frutos",
    });
    expect(result).toEqual([guests[0]]);
  });

  it("filters by tableId exact", () => {
    const withTables = guests.map((g, i) =>
      makeGuest({ ...g, table: { id: `t${i + 1}`, label: `Mesa ${i + 1}` } })
    );
    expect(filterGuests(withTables, { tableId: "t2" })).toEqual([
      withTables[1],
    ]);
  });

  it("returns empty when nothing matches", () => {
    expect(filterGuests(guests, { search: "zzz" })).toEqual([]);
  });
});