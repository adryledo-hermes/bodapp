/**
 * Couple self-registration helpers (multi-tenant setup flow).
 *
 * PURE module: no React, no Prisma, no Next imports — unit-testable in
 * isolation and safe to import from server routes, server pages and client
 * components alike.
 *
 * Slug rules (see `normalizeSlug`): lowercase + trim, strip diacritics
 * (Adrián -> adrian), keep only [a-z0-9-], collapse any run of whitespace /
 * punctuation to a single hyphen, strip edge hyphens, and fall back to "boda"
 * when the result is empty or too short to be a usable URL slug.
 */

import { z } from "zod";

/** Minimum length for a usable slug ("a" alone is not a slug; "ab" is). */
const MIN_SLUG_LENGTH = 2;

/** Strip combining diacritics so "café" -> "cafe", "Mañana" -> "manana". */
function stripDiacritics(input: string): string {
  return input.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Normalize a single fragment WITHOUT the "boda" fallback. Used internally so
 * `slugFromNames` can tell "empty fragment" apart from "empty slug".
 */
function normalizeFragment(input: string): string {
  return stripDiacritics(input)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-") // whitespace/&/!/etc -> single hyphen
    .replace(/-+/g, "-") // collapse duplicate hyphens
    .replace(/^-+|-+$/g, ""); // strip edge hyphens
}

/**
 * Normalize a wedding slug to the canonical form used in /w/[slug] URLs.
 * Falls back to "boda" for empty, punctuation-only or too-short input.
 */
export function normalizeSlug(input: string): string {
  const slug = normalizeFragment(input);
  return slug.length >= MIN_SLUG_LENGTH ? slug : "boda";
}

/**
 * Derive a slug from the couple's names, e.g. ("Adrián", "Aitana") ->
 * "adrian-aitana". Falls back to "boda" when neither name is usable.
 */
export function slugFromNames(coupleNameA: string, coupleNameB: string): string {
  const parts = [normalizeFragment(coupleNameA), normalizeFragment(coupleNameB)].filter(
    Boolean
  );
  if (parts.length === 0) return "boda";
  return normalizeSlug(parts.join("-"));
}

/** Input contract for `applySlugDefaults`. */
export interface SlugDefaultsInput {
  coupleNameA: string;
  coupleNameB: string;
  slug?: string;
}

/**
 * Resolve the final slug for a new wedding: use the provided slug when given
 * (normalized), otherwise derive it from the couple's names. All other input
 * fields pass through unchanged.
 */
export function applySlugDefaults<T extends SlugDefaultsInput>(
  input: T
): T & { slug: string } {
  return {
    ...input,
    slug: input.slug
      ? normalizeSlug(input.slug)
      : slugFromNames(input.coupleNameA, input.coupleNameB),
  };
}

/**
 * Validation contract for the setup form / API payload.
 *
 * - coupleNameA/B: non-empty names, at least 2 chars after trimming.
 * - email        : a valid email address.
 * - password     : at least 8 chars.
 * - slug         : optional; normalized later by `applySlugDefaults`.
 * - locale       : es | en, defaults to "es" when omitted.
 */
export const onboardingSchema = z.object({
  coupleNameA: z.string().trim().min(2),
  coupleNameB: z.string().trim().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  slug: z.string().optional(),
  locale: z.enum(["es", "en"]).default("es"),
});

/** Inferred payload type of `onboardingSchema`. */
export type OnboardingInput = z.infer<typeof onboardingSchema>;