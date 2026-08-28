"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { translate, type Locale } from "@/lib/i18n";

/**
 * EnvelopeIntro — realistic 3D wax-seal envelope opening sequence.
 *
 * DOM layering (bottom → top):
 *   z-1  rear panel + interior liner texture
 *   z-2  invitation card (sits inside the pocket)
 *   z-3  front pocket (covers the lower part of the card)
 *   z-4  top triangular flap (overlaps the pocket) → z-1 mid-rotation
 *   z-5  interactive wax seal button (over the flap tip)
 *
 * Tap sequence (ms from click):
 *     0–300   seal cracks: scale 1.1 + fade out + translateY(-10px), pointer-events off
 *   200–800   flap rotates 180° outward (perspective 1000px, origin top center);
 *             at ~90° (500ms) its z-index drops to 1 so it lands behind the body
 *   600–1300  card slides up out of the pocket (translateY -72%), z-index → 10
 *  1300–1600  whole scene zooms toward the viewer and fades out
 *    1450     real invitation content is revealed
 */

interface EnvelopeIntroProps {
  primary: string;
  accent: string;
  coupleTitle: string;
  locale: Locale;
  /** Rendered once the envelope sequence completes. */
  children: React.ReactNode;
}

type Stage =
  | "sealed"
  | "cracked" //    0ms  seal breaks
  | "flap" //     200ms  flap starts rotating
  | "flapBehind" // 500ms  flap passes 90° → z-index 4 → 1
  | "rising" //    600ms  card slides up
  | "zoom" //     1300ms  scene zooms + fades
  | "open"; //     1450ms  swap to invitation

const EASE = "cubic-bezier(0.4, 0, 0.2, 1)";

export default function EnvelopeIntro({
  primary,
  accent,
  coupleTitle,
  locale,
  children,
}: EnvelopeIntroProps) {
  const [stage, setStage] = useState<Stage>("sealed");
  const timers = useRef<number[]>([]);
  const t = useCallback(
    (key: string) => translate(locale, key),
    [locale]
  );

  useEffect(() => {
    return () => {
      timers.current.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  const handleTap = useCallback(() => {
    if (stage !== "sealed") return;

    // Respect reduced-motion preferences: skip straight to the content.
    if (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setStage("open");
      return;
    }

    const at = (ms: number, next: Stage) => {
      timers.current.push(window.setTimeout(() => setStage(next), ms));
    };
    setStage("cracked"); //     0ms — seal cracks
    at(200, "flap"); //       200ms — flap rotation begins (600ms)
    at(500, "flapBehind"); //  500ms — flap ~90°, swap z-index 4 → 1
    at(600, "rising"); //      600ms — card slides out of the pocket (700ms)
    at(1300, "zoom"); //      1300ms — scene zooms toward the viewer
    at(1450, "open"); //      1450ms — hand over to the invitation
  }, [stage]);

  const isOpen = stage === "open";
  const flapOpen = stage === "flap" || stage === "flapBehind" || stage === "rising" || stage === "zoom";
  const flapBehind = stage === "flapBehind" || stage === "rising" || stage === "zoom";
  const cardUp = stage === "rising" || stage === "zoom";
  const sealBroken = stage !== "sealed";
  const sceneZoom = stage === "zoom";

  // Couple initials for the wax seal: "María & Pedro" → "M/P"
  const coupleInitials = coupleTitle
    .split(/[\s&]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("/");

  if (isOpen) {
    return <div className="animate-fadeInUp">{children}</div>;
  }

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center overflow-hidden px-5"
      style={{
        background: `radial-gradient(circle at 50% 30%, ${lighten(accent, 8)} 0%, ${accent} 70%)`,
        opacity: sceneZoom ? 0 : 1,
        transform: sceneZoom ? "scale(1.45)" : "scale(1)",
        transition: `opacity 300ms ${EASE}, transform 300ms ${EASE}`,
      }}
    >
      {/* Welcome heading */}
      <h1
        className="inv-serif mb-1 text-center text-4xl font-normal italic tracking-wide sm:text-5xl"
        style={{ color: primary }}
      >
        {t("inv.envelopeWelcome")}
      </h1>
      <p className="mb-10 text-center text-xs uppercase tracking-[0.22em]" style={{ color: `${primary}b3` }}>
        {t("inv.envelopeHint")}
      </p>

      {/* ——— Envelope scene (perspective parent for the 3D flap) ——— */}
      <div
        className="relative w-full max-w-md"
        style={{ perspective: "1000px" }}
      >
        {/* z-1: rear panel + interior liner texture */}
        <div
          className="absolute inset-0 z-[1] overflow-hidden rounded-lg"
          style={{ background: shade(accent, -16) }}
        >
          {/* Liner pattern — diagonal stripes tinted with the primary colour */}
          <div
            className="absolute inset-0 opacity-[0.16]"
            style={{
              background: `repeating-linear-gradient(45deg, ${primary} 0px, ${primary} 2px, transparent 2px, transparent 12px)`,
            }}
          />
          {/* Inner shadow so the pocket reads as recessed */}
          <div
            className="absolute inset-0"
            style={{ boxShadow: "inset 0 8px 24px rgba(0,0,0,0.18)" }}
          />
        </div>

        {/* z-2 (→10): invitation card inside the pocket */}
        <div
          className="absolute bottom-2 left-1/2 w-[88%] rounded-md bg-[#FCFAF6] shadow-[0_6px_24px_rgba(93,79,63,0.28)]"
          style={{
            aspectRatio: "1.55 / 1",
            zIndex: cardUp ? 10 : 2,
            transform: cardUp
              ? "translate(-50%, -78%) scale(1.03)"
              : "translate(-50%, 0)",
            transition: `transform 700ms ${EASE}, z-index 0ms`,
          }}
        >
          <div className="flex h-full flex-col items-center justify-center px-4 text-center">
            <p className="text-[9px] uppercase tracking-[0.36em] text-[#7A6A5A]">
              {t("inv.invitation")}
            </p>
            <div className="mx-auto my-2 h-px w-10" style={{ backgroundColor: primary }} />
            <p className="inv-serif text-xl italic leading-snug sm:text-2xl" style={{ color: primary }}>
              {coupleTitle}
            </p>
          </div>
        </div>

        {/* z-3: front pocket — V fold covering the lower part of the card */}
        <div
          className="absolute inset-0 z-[3] rounded-b-lg"
          style={{
            background: `linear-gradient(175deg, ${lighten(accent, 6)} 0%, ${shade(accent, -6)} 100%)`,
            clipPath: "polygon(0 0, 50% 52%, 100% 0, 100% 100%, 0 100%)",
            boxShadow: "0 14px 40px rgba(93,79,63,0.22)",
          }}
        >
          {/* Pocket edge highlight along the V fold */}
          <div
            className="absolute inset-0"
            style={{
              clipPath: "polygon(0 0, 50% 52%, 100% 0, 100% 1.5%, 50% 54.5%, 0 1.5%)",
              background: shade(accent, 18),
            }}
          />
        </div>

        {/* z-4 (→1 mid-rotation): top triangular flap */}
        <div
          className="absolute left-0 top-0 w-full"
          style={{
            transformOrigin: "top center",
            transformStyle: "preserve-3d",
            zIndex: flapBehind ? 1 : 4,
            transform: flapOpen ? "rotateX(180deg)" : "rotateX(0deg)",
            transition: `transform 600ms ${EASE}, z-index 0ms`,
          }}
        >
          <div
            className="w-full"
            style={{
              aspectRatio: "1.9 / 1",
              clipPath: "polygon(0 0, 100% 0, 50% 100%)",
              background: `linear-gradient(180deg, ${shade(accent, -4)} 0%, ${shade(accent, -14)} 100%)`,
              filter: "drop-shadow(0 3px 6px rgba(93,79,63,0.25))",
            }}
          />
        </div>

        {/* z-5: interactive wax seal over the flap tip (+ crack fragments) */}
        <div
          className="absolute left-1/2 top-[52%] z-[5] -translate-x-1/2 -translate-y-1/2"
          style={{
            pointerEvents: sealBroken ? "none" : "auto",
          }}
        >
          {/* Crack fragments — fly apart + fade on tap */}
          <span
            className="absolute left-1/2 top-1/2 block h-6 w-6 rounded-full"
            aria-hidden
            style={{
              background: shade(primary, -8),
              clipPath: "polygon(0 0, 55% 0, 20% 100%)",
              opacity: sealBroken ? 0 : 0.9,
              transform: sealBroken
                ? "translate(-260%, -180%) rotate(-40deg)"
                : "translate(-50%, -50%)",
              transition: `all 300ms ${EASE}`,
            }}
          />
          <span
            className="absolute left-1/2 top-1/2 block h-6 w-6 rounded-full"
            aria-hidden
            style={{
              background: shade(primary, -8),
              clipPath: "polygon(45% 0, 100% 20%, 80% 100%)",
              opacity: sealBroken ? 0 : 0.9,
              transform: sealBroken
                ? "translate(120%, -220%) rotate(35deg)"
                : "translate(-50%, -50%)",
              transition: `all 300ms ${EASE}`,
            }}
          />

          <button
            type="button"
            onClick={handleTap}
            disabled={sealBroken}
            aria-label={t("inv.envelopeOpenAria")}
            className="animate-seal-pulse relative block h-20 w-20 cursor-pointer touch-manipulation rounded-full focus:outline-none disabled:cursor-default"
            style={{
              background: `radial-gradient(circle at 35% 30%, ${lighten(primary, 22)} 0%, ${primary} 62%, ${shade(primary, -14)} 100%)`,
              opacity: sealBroken ? 0 : 1,
              transform: sealBroken ? "scale(1.1) translateY(-10px)" : "scale(1)",
              transition: `all 300ms ${EASE}`,
              boxShadow: "0 4px 14px rgba(0,0,0,0.25), inset 0 -2px 6px rgba(0,0,0,0.2), inset 0 2px 4px rgba(255,255,255,0.25)",
            }}
          >
            {/* Wavy wax edge */}
            <span
              aria-hidden
              className="absolute inset-0 rounded-full"
              style={{
                background: "transparent",
                boxShadow: "inset 0 0 0 3px rgba(0,0,0,0.06)",
              }}
            />
            <span
              className="inv-serif relative text-lg font-semibold italic"
              style={{ color: shade(primary, -38) }}
            >
              {coupleInitials}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

/* ——— Tiny hex helpers (no external deps) ——— */

function clamp(v: number): number {
  return Math.min(255, Math.max(0, Math.round(v)));
}

function shade(hex: string, percent: number): string {
  const clean = hex.replace("#", "");
  const num = parseInt(clean.length === 3 ? clean.replace(/(.)/g, "$1$1") : clean, 16);
  const amt = 2.55 * percent;
  const r = clamp((num >> 16) + amt);
  const g = clamp(((num >> 8) & 0x00ff) + amt);
  const b = clamp((num & 0x0000ff) + amt);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function lighten(hex: string, percent: number): string {
  return shade(hex, percent);
}
