/**
 * Google Maps embed-URL normalization.
 *
 * The "How to get there" section renders a Google Maps iframe. Google only
 * serves embeddable frames from the canonical `maps.google.com/maps?...&output=embed`
 * form. Users routinely paste two things that break:
 *   1. Short links like `https://maps.app.goo.gl/xxxx` — opaque redirects an
 *      <iframe> cannot follow into the map content.
 *   2. Browser share URLs (`www.google.com/maps/place/...`) which refuse to
 *      render in a frame without `&output=embed` (and even then are unreliable).
 *
 * This helper resolves short links server-side, pulls the venue coordinates,
 * and rewrites them into a dependable embed URL. It is deliberately fail-open:
 * if the URL is empty, already canonical, or cannot be resolved, it returns the
 * input unchanged so a valid value is never corrupted.
 */

/** Fast check — no network. Turns obvious share/embed forms into a usable URL. */
export function canonicalizeMapUrl(input: string): string {
  const raw = (input ?? "").trim();
  if (!raw) return raw;

  // Already the canonical embed endpoint → pass through.
  if (/^https?:\/\/[^/]*google\.[^/]+\/maps\/embed/.test(raw)) {
    return raw;
  }
  return raw;
}

/**
 * Resolve a Google Maps URL into an embeddable form.
 *
 * - `maps.app.goo.gl/<code>` (or any URL that redirects): follows the redirect,
 *   extracts  latitude/longitude, and returns `maps.google.com/maps?q=lat,lng&z=16&output=embed`.
 * - canonical `/maps/embed?` or already-embeddable: returned unchanged.
 * - anything else: returned unchanged (fail-open).
 *
 * @returns the embed URL, or the original string when it can't be improved.
 */
export async function resolveMapEmbedUrl(
  input: string | null | undefined,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  const raw = (input ?? "").trim();
  if (!raw) return raw;

  const canonical = canonicalizeMapUrl(raw);
  if (canonical !== raw) return canonical;

  // If it's already the plain ?output=embed form, keep it.
  if (/maps[./]google(?:\.com)?\/maps\?/.test(raw) && /output=embed/.test(raw)) {
    return raw;
  }

  // Try to follow redirects to learn the real destination.
  let finalUrl = raw;
  try {
    const resp = await withTimeout(
      fetchImpl(raw, {
        method: "GET",
        redirect: "follow",
        headers: { accept: "text/html" },
      }),
      4000
    );
    finalUrl = resp.url || raw;
  } catch {
    // Network failure / no internet at publish time → bail, keep the input.
    return raw;
  }

  const coords = extractCoords(finalUrl);
  if (coords) {
    return `https://maps.google.com/maps?q=${coords.lat},${coords.lng}&z=16&output=embed`;
  }

  // No coordinates — Google's redirect may still carry the place NAME in the
  // `/maps/place/<encoded name>` path segment (common for venue short links).
  // Embedding by name works and is frame-safe, so prefer it over the raw
  // short link.
  const placeName = extractPlaceName(finalUrl);
  if (placeName) {
    return `https://maps.google.com/maps?q=${encodeURIComponent(placeName)}&output=embed`;
  }

  // Unresolvable → leave untouched.
  return raw;
}

/**
 * Pull an embeddable place name from a Google Maps place URL's path segment:
 * ``/maps/place/Central+Mosque+of+Melilla,+C.+Garc%C3%ADa+Cabrelles,+...+Melilla``
 * Returns the URL-decoded name, or null when there's no usable segment.
 */
export function extractPlaceName(url: string): string | null {
  try {
    // The path segment after /maps/place/, ending before "?" or "/data" or "#".
    const m = /\/(maps\/place\/)([^?#/]+)/.exec(url);
    if (!m) return null;
    // The encoded name uses "+" for spaces; commas are literal.
    const decoded = decodeURIComponent(m[2].replace(/\+/g, " ")).trim();
    if (decoded) return decoded;
  } catch {
    return null;
  }
  return null;
}

/** Race a promise against a deadline; rejects if it doesn't finish in time. */
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("map url resolve timed out")), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Pull "lat,lng" from @lat,lng[,...] in a place URL, or from ?q= / ?ll=. */
export function extractCoords(url: string): { lat: number; lng: number } | null {
  // Place URLs encode coords in the "@43.5107528,-8.2145154,15z" path segment.
  const at = /@(-?\d+\.?\d*),(-?\d+\.?\d*)/.exec(url);
  if (at) {
    const lat = Number(at[1]);
    const lng = Number(at[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }

  // q=lat,lng or ll=lat,lng query params.
  const parsePair = (s: string) => {
    const m = /^(-?\d+\.?\d*),(-?\d+\.?\d*)$/.exec(s.trim());
    if (!m) return null;
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  };
  try {
    const u = new URL(url);
    const q = u.searchParams.get("q");
    if (q) {
      const p = parsePair(q);
      if (p) return p;
    }
    const ll = u.searchParams.get("ll");
    if (ll) {
      const p = parsePair(ll);
      if (p) return p;
    }
  } catch {
    return null;
  }
  return null;
}