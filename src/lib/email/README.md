# Email integration

Outbound email for the account features (email validation, password recovery),
behind a swappable **provider abstraction layer** with SendPulse as the current
provider. The SendPulse client itself is plain REST against its SMTP API —
Bearer API key auth, **no OAuth**, no SDK, no secrets in code. Everything is
read from env.

- `src/lib/email/types.ts` — provider-neutral contract: `EmailMessage`,
  `EmailProviderResult`, `EmailProvider`
- `src/lib/email/email-providers.ts` — the abstraction layer: `EMAIL_PROVIDERS`
  registry, `getEmailProvider()`, app-facing `sendEmail()`
- `src/lib/email/sendpulse-provider.ts` — SendPulse adapter (never throws;
  maps native errors onto the neutral codes)
- `src/lib/email/sendpulse.ts` — the SendPulse client: `sendEmail()`
  (`POST /smtp/emails`), `verifyAuth()` (`GET /user/info`), `loadConfig()`
- `scripts/send-test-email.ts` — small CLI that checks the key and sends one
  test email

## Abstraction layer

App code talks to the layer, never to a provider, so switching senders is an
env var rather than a code change:

```ts
import { sendEmail } from "@/lib/email/email-providers";

const result = await sendEmail({ to, subject, html, text });
if (!result.ok) {
  // result.code: not_configured | invalid_input | rate_limited | auth |
  //              provider_error | network | invalid_response
}
```

- **Contract** (`types.ts`): `EmailProvider.send(message)` returns
  `{ ok, error?, code?, id? }` and **never throws** — credentials live in the
  provider, not in the caller.
- **Registry** (`email-providers.ts`): `EMAIL_PROVIDERS` maps name → provider.
  **Adding a provider is one entry** plus one adapter module.
- **Selection**: `EMAIL_PROVIDER` (default `sendpulse`). An unknown name
  resolves to `null`, so a misconfigured deployment degrades to
  `{ ok: false, code: "not_configured" }` instead of crashing a request.
- `./sendpulse` stays available for provider-specific work (`npm run
  email:test`, `isRateLimit`); the layer covers the send path.

## Setup

1. Create a account at <https://sendpulse.com> → **Dashboard → API** → generate
   an **API key** (SMTP API section).
2. Copy the placeholders into your `.env` (see [`.env.example`](../../.env.example)):

   ```bash
   SENDPULSE_API_KEY="your-api-key"
   # Verified sender. On the SMTP Test (demo) plan this is pre-verified:
   SENDPULSE_API_FROM_EMAIL="devtest@sendpulseemail.com"
   SENDPULSE_API_FROM_NAME="Bodapp"          # optional
   #SENDPULSE_API_BASE_URL="https://api.sendpulse.com"   # optional (default)
   ```

3. Check the key and send a test message:

   ```bash
   npm run email:test -- --to you@example.com
   ```

### SMTP Test (demo) plan notes — read this

- New accounts start on the **SMTP Test** plan. Its sender
  **`devtest@sendpulseemail.com`** is pre-verified and *Active* out of the box,
  so a test email can be sent immediately — use it as
  `SENDPULSE_API_FROM_EMAIL` while you are on that plan.
- **In demo mode SendPulse overrides the sender** to
  `SP test <devtest@sendpulseemail.com>` and prepends the subject with
  `For development purposes only: `, no matter what `from`/`subject` you pass.
  This is expected, not a bug in this client.
- `devtest@sendpulseemail.com` exists **only** on the Test plan and is removed
  once you verify your own domain and sender. On Free/paid plans set
  `SENDPULSE_API_FROM_EMAIL` to your own verified sender — sending from an
  unverified one returns **HTTP 422 `Sender is not valid`** (the client adds a
  hint about verified senders to that error).
- Test plan limits are enforced by SendPulse (total + per-hour quota). A
  **HTTP 429** surfaces as `SendPulseError` with `code: "rate_limited"` and the
  API's own message — no limits are hardcoded here. Use `isRateLimit(error)` to
  branch on it.

## Configuration

| Env | Required | Default | Meaning |
|---|---|---|---|
| `EMAIL_PROVIDER` | no | `sendpulse` | Which registered provider `getEmailProvider()` resolves |
| `SENDPULSE_API_KEY` | yes | — | Bearer token for `Authorization: Bearer …` |
| `SENDPULSE_API_FROM_EMAIL` | yes | `devtest@sendpulseemail.com` *(Test plan value, set explicitly)* | Verified sender |
| `SENDPULSE_API_FROM_NAME` | no | *(none)* | Display name |
| `SENDPULSE_API_BASE_URL` | no | `https://api.sendpulse.com` | Override for tests/proxies |

Secrets are never hardcoded and never logged; errors carry the API's message,
never the key.

## Usage

Provider-agnostic — what application code should use:

```ts
import { sendEmail } from "@/lib/email/email-providers";

await sendEmail({ to, subject, html, text });   // → { ok, id?, error?, code? }
```

SendPulse-specific — diagnostics and the test CLI:

```ts
import { loadConfig, sendEmail, verifyAuth, isRateLimit, SendPulseError } from "@/lib/email/sendpulse";

const config = loadConfig();          // throws SendPulseError("missing_config") if env incomplete

await verifyAuth();                   // GET /user/info → account info, or a typed 401/403 error

await sendEmail({
  to: "guest@example.com",            // string or string[]
  subject: "Confirma tu correo",
  html: "<p>Confirma tu correo electrónico</p>",
  text: "Confirma tu correo electrónico",
});                                   // → { ok: true, id?, response }

try {
  await sendEmail({ to, subject, html });
} catch (error) {
  if (error instanceof SendPulseError) {
    // error.code: missing_config | invalid_input | rate_limited | auth |
    //             http_error | network | invalid_response
    // error.status / error.body: present for HTTP failures
    if (isRateLimit(error)) { /* wait and retry — plan quotas are dynamic */ }
  }
}
```

Payload actually sent:

```json
{
  "email": {
    "subject": "Test",
    "html": "<p>Hello</p>",
    "text": "Hello",
    "from": { "email": "from@example.com", "name": "Sender" },
    "to": [{ "email": "to@example.com" }]
  }
}
```

### CLI

```bash
npm run email:test -- --to you@example.com
npm run email:test -- --to a@b.com --subject "Hola" --text "Hola mundo"
```

It runs `GET /user/info` first (so a bad key fails before anything is sent),
then `POST /smtp/emails`, and exits non-zero with the typed error on failure.

## Tests

- `tests/lib/email-providers.test.ts` — the abstraction layer: provider
  resolution (default / unknown / whitespace / case), registry delegation, and
  the SendPulse adapter's contract (never throws, neutral error codes).
- `tests/lib/sendpulse.test.ts` — the client: config validation, request shape (URL,
  method, `Authorization: Bearer`, payload), and every error path — 401/403, 422
  (with verified-sender hint), 429 (`rate_limited`), network failure, and
  non-JSON responses. All with a stubbed `fetch`; no network, no real key.

```bash
npm test
```
