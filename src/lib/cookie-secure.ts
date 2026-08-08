/**
 * Decide whether session cookies should carry the `Secure` flag.
 *
 * Browser rules: a cookie flagged `Secure` is ONLY sent back over HTTPS. If the
 * app is served over plain HTTP (IP:port, no TLS — the v1 Hetzner setup), a
 * `Secure` cookie is stored but never transmitted, which makes every page see
 * no session and bounce you to /login immediately after a successful login.
 *
 * So the flag must match the ACTUAL transport:
 *   - It follows the scheme of PUBLIC_BASE_URL (https → secure, http → not).
 *   - An explicit COOKIE_SECURE env var overrides it for setups where the app
 *     sits behind a TLS terminator (proxy) and the request origin isn't https.
 */
export function cookieSecure(): boolean {
  if (process.env.COOKIE_SECURE !== undefined) {
    return process.env.COOKIE_SECURE === "true";
  }
  const base = process.env.PUBLIC_BASE_URL ?? "";
  return base.startsWith("https://");
}