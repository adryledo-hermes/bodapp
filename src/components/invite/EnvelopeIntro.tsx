"use client";

import { useState } from "react";
import { translate, type Locale } from "@/lib/i18n";

/**
 * EnvelopeIntro — full-screen envelope that opens when the guest taps the wax
 * seal. Colours come from the invitation template (primary = wax, accent =
 * envelope body). Once opened, the invitation content is revealed with a
 * fade/slide animation.
 */

interface EnvelopeIntroProps {
  primary: string;
  accent: string;
  coupleTitle: string;
  locale: Locale;
  /** Rendered once the envelope is open. */
  children: React.ReactNode;
}

export default function EnvelopeIntro({
  primary,
  accent,
  coupleTitle,
  locale,
  children,
}: EnvelopeIntroProps) {
  const [phase, setPhase] = useState<"closed" | "opening" | "open">("closed");
  const t = (key: string) => translate(locale, key);

  function handleTap() {
    if (phase !== "closed") return;
    setPhase("opening");
    // Give the flap animation time to complete before swapping content.
    window.setTimeout(() => setPhase("open"), 900);
  }

  const isOpen = phase === "open";
  const isOpening = phase === "opening";

  // "María & Pedro" → "M/P" initials for the wax seal.
  const coupleInitials = coupleTitle
    .split(/[\s&]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("/");

  return (
    <div className="relative min-h-screen" style={{ background: accent }}>
      {/* ——— Envelope (closed / opening) ——— */}
      {!isOpen && (
        <div className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
          {/* Welcome heading */}
          <h1
            className="inv-serif mb-8 text-center text-4xl font-normal italic tracking-wide sm:text-5xl"
            style={{ color: primary }}
          >
            {t("inv.envelopeWelcome")}
          </h1>
          <p
            className="mb-12 text-center text-sm tracking-wide"
            style={{ color: `${primary}cc` }}
          >
            {t("inv.envelopeHint")}
          </p>

          {/* Envelope mockup */}
          <button
            type="button"
            onClick={handleTap}
            aria-label={t("inv.envelopeOpenAria")}
            className="relative mx-auto block w-full max-w-md cursor-pointer focus:outline-none"
          >
            {/* Envelope body (rectangle) */}
            <div
              className="relative w-full overflow-hidden rounded-lg shadow-[0_18px_60px_rgba(93,79,63,0.25)]"
              style={{ background: accent, aspectRatio: "1.45 / 1" }}
            >
              {/* Envelope texture — subtle noise via radial gradient */}
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "radial-gradient(circle at 30% 20%, rgba(255,255,255,0.25) 0%, transparent 60%), radial-gradient(circle at 70% 80%, rgba(0,0,0,0.04) 0%, transparent 55%)",
                }}
              />

              {/* Letter card that slides out when opened */}
              <div
                className={`absolute left-1/2 top-4 w-[92%] -translate-x-1/2 rounded-md bg-[#FCFAF6] px-4 py-5 text-center shadow-md transition-all duration-700 ease-out ${
                  isOpening ? "-translate-y-[110%] opacity-0" : ""
                }`}
              >
                <p className="inv-serif text-xl italic" style={{ color: primary }}>
                  {coupleTitle}
                </p>
              </div>
            </div>

            {/* Flap — triangle on top; rotates up when opening */}
            <div
              className="absolute left-0 top-0 w-full origin-top transition-transform duration-700 ease-out"
              style={{
                transform: isOpening ? "rotateX(180deg)" : "rotateX(0deg)",
                perspective: "800px",
              }}
            >
              <div
                className="h-0 w-full border-l-[50vw] border-r-[50vw] border-t-[42%] border-l-transparent border-r-transparent"
                style={{ borderTopColor: shade(accent, -12) }}
              />
            </div>

            {/* Wax seal — centered on the flap edge */}
            <div
              className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transition-all duration-500 ${
                isOpening ? "scale-150 opacity-0" : "scale-100 opacity-100 animate-seal-pulse"
                }`}
            >
              <div
                className="flex h-20 w-20 items-center justify-center rounded-full shadow-lg"
                style={{
                  background: `radial-gradient(circle at 35% 30%, ${lighten(primary, 20)} 0%, ${primary} 65%, ${darken(primary, 10)} 100%)`,
                }}
              >
                <span className="inv-serif text-lg italic font-semibold" style={{ color: `${darken(primary, 35)}` }}>
                  {coupleInitials}
                </span>
              </div>
            </div>
          </button>
        </div>
      )}

      {/* ——— Opened invitation ——— */}
      {isOpen && (
        <div className="animate-[fadeInUp_0.6s_ease-out]">
          {children}
        </div>
      )}
    </div>
  );
}

/** Tiny hex-colour helpers (no external deps). */
function shade(hex: string, percent: number): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const amt = Math.round(2.55 * percent);
  const r = Math.min(255, Math.max(0, (num >> 16) + amt));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00ff) + amt));
  const b = Math.min(255, Math.max(0, (num & 0x0000ff) + amt));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function lighten(hex: string, percent: number): string {
  return shade(hex, percent);
}

function darken(hex: string, percent: number): string {
  return shade(hex, -percent);
}