/**
 * Pure, typed helpers for the invitation template. No React/Next imports here
 * so this module is unit-testable and free of server/client concerns (mirrors
 * src/lib/seating.ts, src/lib/decorations.ts and src/lib/tasks.ts).
 *
 * Store bank account on the Wedding model (schema field `bankAccount`); the
 * template content itself carries the invitation copy (names, message, date,
 * venue, colours, custom sections).
 */

export interface TemplateColors {
  primary: string;
  accent: string;
}

export interface TemplateContent {
  titleA: string;
  titleB: string;
  message: string;
  date: string;
  time: string;
  venue: string;
  dressCode: string;
  schedule: string;
  directions: string;
  accommodation: string;
  bankAccount: string;
  sections: string[];
  colors: TemplateColors;
  /** Optional hero image; no decorative frame is used. */
  imageUrl: string | null;
}

/** The default (unpublished) template content, shown until the couple saves. */
export const DEFAULT_TEMPLATE: TemplateContent = {
  titleA: "",
  titleB: "",
  message: "Os invitamos a celebrar nuestro enlace con nosotros.",
  date: "",
  time: "",
  venue: "",
  dressCode: "",
  schedule: "",
  directions: "",
  accommodation: "",
  bankAccount: "",
  sections: [],
  colors: { primary: "#7A6A5A", accent: "#F3EFE8" },
  imageUrl: null,
};

/** The version of the "no template persisted yet" state. Bumps on publish. */
export const DEFAULT_TEMPLATE_VERSION = 1;

/**
 * Merge arbitrary (possibly unknown/partial) content with the defaults so the
 * UI and the public render always have every field present and typed. Unknown
 * input is coerced safely: only strings are kept for text fields and only
 * string array members are kept for sections.
 */
export function normalizeTemplateContent(raw: unknown): TemplateContent {
  const r = (raw ?? {}) as Record<string, unknown>;

  const pickString = (key: string, fallback: string): string =>
    typeof r[key] === "string" ? (r[key] as string) : fallback;

  const colorsRaw =
    r.colors && typeof r.colors === "object"
      ? (r.colors as Record<string, unknown>)
      : {};

  const pickColor = (key: string, fallback: string): string =>
    typeof colorsRaw[key] === "string" ? (colorsRaw[key] as string) : fallback;

  return {
    titleA: pickString("titleA", DEFAULT_TEMPLATE.titleA),
    titleB: pickString("titleB", DEFAULT_TEMPLATE.titleB),
    message: pickString("message", DEFAULT_TEMPLATE.message),
    date: pickString("date", DEFAULT_TEMPLATE.date),
    time: pickString("time", DEFAULT_TEMPLATE.time),
    venue: pickString("venue", DEFAULT_TEMPLATE.venue),
    dressCode: pickString("dressCode", DEFAULT_TEMPLATE.dressCode),
    schedule: pickString("schedule", DEFAULT_TEMPLATE.schedule),
    directions: pickString("directions", DEFAULT_TEMPLATE.directions),
    accommodation: pickString("accommodation", DEFAULT_TEMPLATE.accommodation),
    bankAccount: pickString("bankAccount", DEFAULT_TEMPLATE.bankAccount),
    sections: Array.isArray(r.sections)
      ? r.sections.filter((s): s is string => typeof s === "string")
      : [],
    colors: {
      primary: pickColor("primary", DEFAULT_TEMPLATE.colors.primary),
      accent: pickColor("accent", DEFAULT_TEMPLATE.colors.accent),
    },
    imageUrl:
      typeof r.imageUrl === "string" && r.imageUrl.trim()
        ? r.imageUrl.trim()
        : null,
  };
}

/** The next template version (the previous one plus one). */
export function incrementVersion(v: number): number {
  return v + 1;
}

/**
 * Matches a CSS hex color — #RGB, #RGBA, #RRGGBB or #RRGGBBAA — or an empty
 * string (no color). Used to gate which stored color values are ever applied as
 * a CSS style, so arbitrary DB content can't smuggle `background-image:url(…)`
 * or similar into the `style=` attribute.
 */
export const HEX_COLOR_RE = /^(#[0-9a-fA-F]{3}|#[0-9a-fA-F]{4}|#[0-9a-fA-F]{6}|#[0-9a-fA-F]{8}|)$/;

/** True when the value is a valid hex color (or empty). */
export function isValidHexColor(value: string): boolean {
  return HEX_COLOR_RE.test(value);
}
