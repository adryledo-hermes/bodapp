import { NextResponse } from "next/server";

/**
 * Liveness endpoint used by three consumers:
 *  - the docker-compose healthcheck on the app container,
 *  - the deploy health gate (deploy/deploy.sh) and Caddy's active
 *    reverse_proxy health checks,
 *  - quick manual probes (`curl https://<domain>/healthz`).
 *
 * Deliberately DB-free: it answers 200 as long as the Node process is
 * serving, so a transient Postgres hiccup doesn't flap the proxy.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { status: "ok" },
    { headers: { "cache-control": "no-store" } },
  );
}
