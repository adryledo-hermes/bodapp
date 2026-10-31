/**
 * Send a test email through SendPulse.
 *
 *   npm run email:test -- --to you@example.com
 *   npm run email:test -- --to a@b.com --subject "Hola" --text "Hola!"
 *
 * Reads SENDPULSE_* from env (.env / your shell) — no secrets in this file.
 * Steps: load config → GET /user/info (key check) → POST /smtp/emails.
 */

import {
  SENDPULSE_TEST_PLAN_SENDER,
  SendPulseError,
  loadConfig,
  sendEmail,
  verifyAuth,
} from "../src/lib/email/sendpulse";

interface Args {
  to?: string;
  subject: string;
  text?: string;
  html?: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { subject: "Bodapp · SendPulse test email" };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    switch (flag) {
      case "--to":
        args.to = value;
        i++;
        break;
      case "--subject":
        args.subject = value ?? args.subject;
        i++;
        break;
      case "--text":
        args.text = value;
        i++;
        break;
      case "--html":
        args.html = value;
        i++;
        break;
      case "--help":
      case "-h":
        printUsage();
        process.exit(0);
      default:
        if (flag.startsWith("--")) {
          console.error(`Unknown option: ${flag}`);
          printUsage();
          process.exit(2);
        }
    }
  }
  return args;
}

function printUsage(): void {
  console.log(
    [
      "Usage: npm run email:test -- --to <email> [--subject <s>] [--text <t>] [--html <h>]",
      "",
      "Required env:",
      "  SENDPULSE_API_KEY         API key (Bearer) from your SendPulse account",
      `  SENDPULSE_API_FROM_EMAIL  verified sender (SMTP Test plan: ${SENDPULSE_TEST_PLAN_SENDER})`,
      "Optional env:",
      "  SENDPULSE_API_FROM_NAME, SENDPULSE_API_BASE_URL",
    ].join("\n")
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const to = args.to ?? process.env.SENDPULSE_TEST_TO;
  if (!to) {
    console.error("Missing recipient.\n");
    printUsage();
    process.exit(2);
  }

  const config = loadConfig();

  console.log(`→ verifying API key against ${config.baseUrl}/user/info ...`);
  const info = await verifyAuth(config);
  const account =
    (typeof info.email === "string" && info.email) ||
    (typeof info.name === "string" && info.name) ||
    Object.keys(info).slice(0, 6).join(", ") ||
    "ok";
  console.log(`  API key OK — account: ${account}`);

  console.log(`→ sending test email to ${to} (from ${config.fromEmail}) ...`);
  const result = await sendEmail(
    {
      to,
      subject: args.subject,
      text: args.text ?? "This is a SendPulse test email from Bodapp.",
      html:
        args.html ??
        "<p>This is a <strong>SendPulse</strong> test email from Bodapp.</p>",
    },
    config
  );

  console.log(`  sent ✓${result.id ? ` (id ${result.id})` : ""}`);
  console.log(
    [
      "",
      "Note (SMTP Test/demo plan): SendPulse rewrites the sender to",
      `  SP test <${SENDPULSE_TEST_PLAN_SENDER}>`,
      'and prefixes the subject with "For development purposes only: ".',
      "That is expected in demo mode.",
    ].join("\n")
  );
}

main().catch((error: unknown) => {
  if (error instanceof SendPulseError) {
    console.error(`\n✖ ${error.message}`);
    if (error.status) console.error(`  code: ${error.code}, HTTP ${error.status}`);
    if (error.code === "missing_config") {
      console.error(
        "\nSet the SENDPULSE_* variables in your .env (see src/lib/email/README.md)."
      );
    }
    process.exit(1);
  }
  console.error(error);
  process.exit(1);
});
