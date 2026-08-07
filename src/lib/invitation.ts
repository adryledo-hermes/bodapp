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
  bankAccount: string;
  sections: string[];
  colors: TemplateColors;
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
  bankAccount: "",
  sections: [],
  colors: { primary: "#B76E79", accent: "#F7E7CE" },
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
    bankAccount: pickString("bankAccount", DEFAULT_TEMPLATE.bankAccount),
    sections: Array.isArray(r.sections)
      ? r.sections.filter((s): s is string => typeof s === "string")
      : [],
    colors: {
      primary: pickColor("primary", DEFAULT_TEMPLATE.colors.primary),
      accent: pickColor("accent", DEFAULT_TEMPLATE.colors.accent),
    },
  };
}

/** The next template version (the previous one plus one). */
export function incrementVersion(v: number): number {
  return v + 1;
}
