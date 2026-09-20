import { describe, expect, it } from "vitest";
import {
  canonicalizeMapUrl,
  extractCoords,
  resolveMapEmbedUrl,
} from "@/lib/maps-url";

describe("extractCoords", () => {
  it("parses @lat,lng from a Google Maps place URL", () => {
    const url =
      "https://www.google.com/maps/place/Restaurante+Pazo+Do+Monte/@43.5107528,-8.2145154,1510m/data=!1m3!4m6";
    expect(extractCoords(url)).toEqual({ lat: 43.5107528, lng: -8.2145154 });
  });

  it("parses q=lat,lng query form", () => {
    expect(extractCoords("https://maps.google.com/maps?q=43.5107528,-8.2145154&z=16")).toEqual({
      lat: 43.5107528,
      lng: -8.2145154,
    });
  });

  it("parses ll=lat,lng query form", () => {
    expect(extractCoords("https://www.google.com/maps/place/X/@11,-22,10z")).toEqual({
      lat: 11,
      lng: -22,
    });
  });

  it("returns null when there are no coordinates", () => {
    expect(extractCoords("https://example.com/maps?x=1")).toBeNull();
  });
});

describe("canonicalizeMapUrl", () => {
  it("passes through the canonical /maps/embed endpoint untouched", () => {
    const url = "https://www.google.com/maps/embed?pb=abc123";
    expect(canonicalizeMapUrl(url)).toBe(url);
  });

  it("passes through empty input", () => {
    expect(canonicalizeMapUrl("")).toBe("");
  });
});

describe("resolveMapEmbedUrl", () => {
  it("keeps an already-embeddable ?output=embed URL unchanged", async () => {
    const url = "https://maps.google.com/maps?q=43.51,-8.21&z=16&output=embed";
    expect(await resolveMapEmbedUrl(url)).toBe(url);
  });

  it("resolves a short link via a fetch stub that follows to a place URL", async () => {
    const short = "https://maps.app.goo.gl/kzqRdpqNMKwXHnig8";
    const mockFetch = () =>
      Promise.resolve({ url: "https://www.google.com/maps/place/Restaurante+Pazo+Do+Monte/@43.5107528,-8.2145154,1510m/data=!3m1" } as unknown as Response);
    const result = await resolveMapEmbedUrl(short, mockFetch);
    expect(result).toBe(
      "https://maps.google.com/maps?q=43.5107528,-8.2145154&z=16&output=embed"
    );
  });

  it("is fail-open: returns the original when fetch throws", async () => {
    const short = "https://maps.app.goo.gl/notfound";
    const boom = () =>
      Promise.reject(new Error("network down"));
    expect(await resolveMapEmbedUrl(short, boom)).toBe(short);
  });

  it("returns empty unchanged", async () => {
    expect(await resolveMapEmbedUrl("")).toBe("");
    expect(await resolveMapEmbedUrl(null)).toBe("");
    expect(await resolveMapEmbedUrl(undefined)).toBe("");
  });
});