/**
 * Phone-prefix helpers for the guest forms.
 *
 * The guest `phone` field is stored as a single human-readable string that may
 * include the international dial code (e.g. "+34 600 000 000"). The UI shows
 * it as two fields: a country-code prefix (prefilled from the browser's
 * locale) and the national number. This module combines/splits them and maps a
 * browser region tag to a dial code, purely so the client forms can offer a
 * sensibly-prefilled prefix without a network call.
 */

/** ISO 3166-1 alpha-2 country code → international dialing code (with +). */
export const COUNTRY_TO_DIAL: Record<string, string> = {
  ES: "+34",
  AD: "+376",
  AR: "+54",
  AT: "+43",
  AU: "+61",
  BE: "+32",
  BG: "+359",
  BO: "+591",
  BR: "+55",
  CA: "+1",
  CH: "+41",
  CL: "+45",
  CN: "+86",
  CO: "+57",
  CR: "+506",
  CU: "+53",
  CZ: "+420",
  DE: "+49",
  DK: "+45",
  DO: "+1",
  EC: "+593",
  EE: "+372",
  EG: "+20",
  FI: "+358",
  FR: "+33",
  GB: "+44",
  GR: "+30",
  GT: "+502",
  HN: "+504",
  HR: "+385",
  HU: "+36",
  IE: "+353",
  IN: "+91",
  IT: "+39",
  JP: "+81",
  KR: "+82",
  LT: "+370",
  LU: "+352",
  LV: "+371",
  MA: "+212",
  MX: "+52",
  MT: "+356",
  NL: "+31",
  NO: "+47",
  NZ: "+64",
  PA: "+507",
  PE: "+51",
  PL: "+48",
  PT: "+351",
  PY: "+595",
  RO: "+40",
  SE: "+46",
  SG: "+65",
  SI: "+386",
  SK: "+421",
  US: "+1",
  UY: "+598",
  VE: "+58",
  ZA: "+27",
};

/** Default dial code used when the browser region can't be matched. */
export const DEFAULT_DIAL_CODE = "+34";

/**
 * Map a locale/region tag (e.g. "es-ES", "en-US", "fr") to a dial code, or the
 * default when it can't be matched.
 */
export function dialCodeForRegion(region: string | undefined | null): string {
  if (!region) return DEFAULT_DIAL_CODE;
  const upper = region.trim().toUpperCase();
  // Strip any subtags: "es-ES" → "ES" (take the last, most specific, segment).
  const parts = upper.split(/[-_]/).filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i--) {
    const c = COUNTRY_TO_DIAL[parts[i]];
    if (c) return c;
  }
  return DEFAULT_DIAL_CODE;
}

/** Dial code for the browser's primary language, or the default if unknown. */
export function browserDialCode(): string {
  if (typeof navigator === "undefined") return DEFAULT_DIAL_CODE;
  return dialCodeForRegion(navigator.language);
}

/**
 * Split a stored phone ("+34 600 000 000" / "+34600000000" / "600 000 000")
 * into { prefix: "+34"|"", number: "600 000 000" }. When there's no leading
 * `+`, prefix is "" and the whole thing is the number (the prefix field can
 * still choose one on save).
 */
export function splitPhone(phone: string | null | undefined): {
  prefix: string;
  number: string;
} {
  const raw = (phone ?? "").trim();
  if (!raw) return { prefix: "", number: "" };

  const hasPlus = raw.startsWith("+");
  const body = hasPlus ? raw.slice(1).trim() : raw;
  if (!hasPlus) return { prefix: "", number: raw };

  // Dial codes are 1-3 digits from the COUNTRY map — match the longest known
  // prefix that the number starts with, so "+34 600..." → "+34" + "600...".
  const digits = body.match(/^\d+/)?.[0] ?? "";
  let matched = "";
  for (let len = 3; len >= 1; len--) {
    const candidate = digits.slice(0, len);
    if (candidate && String(candidate).length === len) {
      const known = Object.values(COUNTRY_TO_DIAL).some(
        (d) => d === `+${candidate}`
      );
      if (known) {
        matched = candidate;
        break;
      }
    }
  }
  const prefix = matched ? `+${matched}` : "";
  const number = (matched ? body.slice(matched.length) : body).trim();
  return { prefix, number };
}

/**
 * Join a prefix and a national number into the stored phone form: strips the
 * leading "+" from the number if the user typed it again, collapses whitespace,
 * and puts a single space after the prefix. Empty → "".
 */
export function joinPhone(prefix: string, number: string): string {
  const p = (prefix ?? "").trim().replace(/\+/g, "");
  const n = (number ?? "").trim().replace(/^0+/, "0"); // keep a lone leading 0
  const digits = n.replace(/[^\d]/g, "");
  if (!digits) return ""; // a prefix with no number is not a stored phone
  return p ? `+${p} ${digits}` : digits;
}