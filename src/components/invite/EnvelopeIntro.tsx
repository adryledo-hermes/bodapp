"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { translate, type Locale } from "@/lib/i18n";

/**
 * EnvelopeIntro — realistic wax-seal envelope opening sequence.
 *
 * Flat z-index stacking (no preserve-3d): back z1 · card z2 · pocket z3 ·
 * flap z4→z1 · seal z5. Perspective only drives the flap's rotateX.
 *
 * Geometry (scene aspect 1.5:1, flap triangle tip at 55% height):
 *   card top 35% → its top corners sit where the flap triangle is ~64% wide,
 *   so the card is FULLY hidden behind flap+pocket (no white paper peeking).
 *
 * Aged-paper texture: two SVG turbulence layers (fine fibers + large stains),
 * edge vignette, sepia tint — on pocket, flap and (faintly) the card.
 *
 * Tap sequence (ms from click) — slow open, short blur:
 *       0  seal cracks: fragments fly (1100ms)
 *     400  flap rotates 180° outward, 2200ms; z 4→1 at ~90° (1500ms)
 *    2400  invitation slides up out of the pocket (2200ms) AND fx starts
 *    4600  full invitation revealed (fadeUp 0.6s — snappy, little blur wait)
 */

interface EnvelopeIntroProps {
  primary: string;
  accent: string;
  coupleTitle: string;
  /** Optional short date line for the card (e.g. "12 · septiembre · 2026"). */
  cardDate?: string;
  locale: Locale;
  /** Rendered once the envelope sequence completes. */
  children: React.ReactNode;
}

type Stage =
  | "sealed"
  | "broken" //      0ms  seal cracks + fragments
  | "flap" //      400ms  flap rotating (2200ms)
  | "flapBehind" //1500ms  flap passes ~90° → z 4→1
  | "rising" //    2400ms  card emerges + fx overlay begins
  | "open"; //     4600ms  hand over to the invitation

export default function EnvelopeIntro({
  primary,
  accent,
  coupleTitle,
  cardDate,
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
    setStage("broken"); //        0ms — seal cracks
    at(400, "flap"); //         400ms — flap rotation begins (2200ms)
    at(1500, "flapBehind"); // 1500ms — flap ~90°, swap z-index 4 → 1
    at(2400, "rising"); //     2400ms — card emerges; fx starts in parallel
    at(4600, "open"); //       4600ms — reveal the invitation
  }, [stage]);

  const isOpen = stage === "open";
  const flapOpen = stage !== "sealed" && stage !== "broken";
  const flapBehind = stage === "flapBehind" || stage === "rising";
  const cardUp = stage === "rising";
  const sealBroken = stage !== "sealed";
  const fxOn = stage === "rising";

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
      className="fixed inset-0 z-40 flex flex-col items-center justify-center overflow-hidden px-5"
      style={{
        background: `radial-gradient(circle at 50% 20%, ${mix(accent, "#fffdf6", 0.9)} 0%, ${mix(accent, "#e8dcc0", 0.85)} 70%, ${mix(accent, "#d9c9a4", 0.75)} 100%)`,
      }}
    >
      {/* Shared aged-paper SVG filter definitions */}
      <svg width="0" height="0" className="absolute" aria-hidden>
        <defs>
          {/* Fine paper fibers */}
          <filter id="paperFibers" x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="4" seed="7" stitchTiles="stitch" />
            <feColorMatrix
              type="matrix"
              values="0 0 0 0 0.36  0 0 0 0 0.31  0 0 0 0 0.24  0 0 0 0.26 0"
            />
          </filter>
          {/* Large age stains / blotches */}
          <filter id="paperStains" x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.016" numOctaves="3" seed="21" stitchTiles="stitch" />
            <feColorMatrix
              type="matrix"
              values="0 0 0 0 0.48  0 0 0 0 0.38  0 0 0 0 0.22  0 0 0 0.12 0"
            />
          </filter>
        </defs>
      </svg>

      {/* Welcome heading + hint */}
      <h1
        className="inv-serif mb-1 text-center text-4xl font-normal italic tracking-wide sm:text-5xl"
        style={{ color: primary }}
      >
        {t("inv.envelopeWelcome")}
      </h1>
      <p
        className="mb-10 text-center text-xs uppercase tracking-[0.22em] transition-opacity duration-500"
        style={{
          color: `${shade(primary, -18)}b3`,
          opacity: stage === "sealed" ? 1 : 0,
        }}
      >
        {t("inv.envelopeHint")}
      </p>

      {/* ——— Envelope scene ——— */}
      <div
        className="relative w-full max-w-md"
        style={{ perspective: "1400px", aspectRatio: "1.5 / 1" }}
      >
        {/* z-1: rear panel + striped liner (aged) */}
        <div
          className="absolute inset-0 z-[1] rounded-md"
          style={{
            background: `repeating-linear-gradient(45deg, ${hexA(primary, 0.22)} 0px, ${hexA(primary, 0.22)} 1.5px, transparent 1.5px, transparent 11px), linear-gradient(160deg, ${mix(accent, "#c9bfae", 0.7)} 0%, #cfc4b0 100%)`,
            boxShadow: "inset 0 10px 30px rgba(64,59,54,.28), 0 1px 0 rgba(255,255,255,.6)",
          }}
        />

        {/* z-2: invitation card (the full invitation, folded small inside) */}
        <div
          className="absolute left-1/2 z-[2] overflow-hidden rounded-[3px]"
          style={{
            top: "35%",
            width: "60%",
            aspectRatio: "1.5 / 1",
            background:
              "radial-gradient(circle at 25% 12%, rgba(255,255,255,.9), transparent 55%), linear-gradient(175deg, #fffdf8 0%, #FCFAF6 60%, #f4efe5 100%)",
            boxShadow: "0 1px 2px rgba(64,59,54,.12), 0 14px 38px rgba(64,59,54,.32)",
            transform: cardUp
              ? "translateX(-50%) translateY(-190%) scale(2.35)"
              : "translateX(-50%) translateY(0)",
            transition: `transform 2200ms cubic-bezier(0.22, 1, 0.36, 1)`,
          }}
        >
          {/* faint paper grain on the card */}
          <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-40" aria-hidden>
            <rect width="100%" height="100%" filter="url(#paperFibers)" />
          </svg>
          <div
            className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-center"
            style={{
              transform: cardUp ? "scale(1)" : "scale(0.62)",
              transition: `transform 2200ms cubic-bezier(0.22, 1, 0.36, 1)`,
            }}
          >
            <p className="text-[9px] uppercase tracking-[0.38em] text-[#7A6A5A]">
              {t("inv.invitation")}
            </p>
            <div className="h-px w-10" style={{ backgroundColor: primary }} />
            <p className="inv-serif italic text-[#403B36]" style={{ fontSize: "clamp(15px, 4.4vw, 22px)" }}>
              {coupleTitle}
            </p>
            {cardDate && (
              <p className="text-[9px] uppercase tracking-[0.2em] text-[#7A6A5A]">{cardDate}</p>
            )}
          </div>
        </div>

        {/* z-3: front pocket with V-fold (aged paper) */}
        <div
          className="absolute inset-0 z-[3] rounded-md"
          style={{
            background: `linear-gradient(173deg, ${mix(accent, "#f6ecd6", 0.9)} 0%, ${mix(accent, "#e3d5b5", 0.55)} 55%, ${mix(accent, "#cdbb92", 0.8)} 100%)`,
            clipPath: "polygon(0 0, 50% 55%, 100% 0, 100% 100%, 0 100%)",
            boxShadow: "0 22px 44px rgba(64,59,54,.30), inset 0 -2px 0 rgba(255,255,255,.5)",
          }}
        >
          {/* side fold shadows */}
          <div
            className="absolute inset-0"
            style={{
              background: "linear-gradient(115deg, rgba(64,59,54,.10) 0%, transparent 26%)",
              clipPath: "polygon(0 0, 50% 55%, 0 100%)",
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              background: "linear-gradient(245deg, rgba(64,59,54,.10) 0%, transparent 26%)",
              clipPath: "polygon(100% 0, 50% 55%, 100% 100%)",
            }}
          />
          {/* aged paper: stains + fibers + vignette */}
          <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
            <rect width="100%" height="100%" filter="url(#paperStains)" />
          </svg>
          <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
            <rect width="100%" height="100%" filter="url(#paperFibers)" />
          </svg>
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background: "radial-gradient(ellipse at 50% 45%, transparent 52%, rgba(64,59,54,.16) 100%)",
            }}
          />
        </div>

        {/* z-4 (→1 mid-rotation): top triangular flap, two faces */}
        <div
          className="absolute left-0 top-0 w-full"
          style={{
            height: "55%",
            transformOrigin: "top center",
            zIndex: flapBehind ? 1 : 4,
            transform: flapOpen ? "rotateX(180deg)" : "rotateX(0deg)",
            transition: `transform 2200ms cubic-bezier(0.4, 0, 0.2, 1), z-index 0s`,
            transitionDelay: flapBehind ? "0s, 1.1s" : "0s",
          }}
        >
          {/* front face (aged paper) */}
          <div
            className="absolute inset-0"
            style={{
              clipPath: "polygon(0 0, 100% 0, 50% 100%)",
              background: `radial-gradient(circle at 50% 0%, ${mix(accent, "#f6ecd6", 0.95)} 0%, ${mix(accent, "#e3d5b5", 0.5)} 58%, ${mix(accent, "#c6b28a", 0.78)} 100%)`,
              boxShadow: "inset 0 -6px 14px rgba(64,59,54,.10)",
              backfaceVisibility: "hidden",
            }}
          >
            {/* vignette at the fold */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background: "radial-gradient(ellipse at 50% 100%, rgba(64,59,54,.10), transparent 45%)",
              }}
            />
            {/* aged paper on the flap */}
            <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
              <rect width="100%" height="100%" filter="url(#paperStains)" />
            </svg>
            <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
              <rect width="100%" height="100%" filter="url(#paperFibers)" />
            </svg>
          </div>
          {/* back face (visible when open — striped liner) */}
          <div
            className="absolute inset-0"
            style={{
              clipPath: "polygon(0 0, 100% 0, 50% 100%)",
              background: `repeating-linear-gradient(45deg, ${hexA(primary, 0.22)} 0px, ${hexA(primary, 0.22)} 1.5px, transparent 1.5px, transparent 11px), linear-gradient(180deg, #d8cdb9 0%, #cbbfa8 100%)`,
              transform: "rotateX(180deg)",
              backfaceVisibility: "hidden",
            }}
          />
        </div>

        {/* z-5: wax seal (SVG) + crack fragments */}
        <div
          className="absolute left-1/2 top-[55%] z-[5]"
          style={{
            transform: sealBroken
              ? "translate(-50%, -50%) scale(1.14)"
              : "translate(-50%, -50%)",
            pointerEvents: sealBroken ? "none" : "auto",
            opacity: sealBroken ? 0 : 1,
            transition: `opacity 500ms cubic-bezier(0.4, 0, 0.2, 1), transform 500ms cubic-bezier(0.4, 0, 0.2, 1)`,
          }}
        >
          <button
            type="button"
            onClick={handleTap}
            disabled={sealBroken}
            aria-label={t("inv.envelopeOpenAria")}
            className="animate-seal-pulse relative block cursor-pointer touch-manipulation rounded-full focus:outline-none disabled:cursor-default"
            style={{ width: 92, height: 92 }}
          >
            <svg viewBox="0 0 120 120" width="100%" height="100%" style={{ filter: "drop-shadow(0 6px 12px rgba(64,59,54,.45))" }}>
              <defs>
                <radialGradient id="wax" cx="38%" cy="30%" r="75%">
                  <stop offset="0%" stopColor={lighten(primary, 16)} />
                  <stop offset="45%" stopColor={primary} />
                  <stop offset="80%" stopColor={shade(primary, -13)} />
                  <stop offset="100%" stopColor={shade(primary, -19)} />
                </radialGradient>
                <radialGradient id="waxIn" cx="50%" cy="42%" r="62%">
                  <stop offset="0%" stopColor={shade(primary, -13)} stopOpacity="0.55" />
                  <stop offset="70%" stopColor={shade(primary, -19)} stopOpacity="0.18" />
                  <stop offset="100%" stopColor={shade(primary, -24)} stopOpacity="0" />
                </radialGradient>
                <filter id="waxRough">
                  <feTurbulence type="fractalNoise" baseFrequency="0.11" numOctaves="4" seed="11" result="n" />
                  <feDisplacementMap in="SourceGraphic" in2="n" scale="5.5" />
                </filter>
              </defs>
              <g filter="url(#waxRough)">
                <circle cx="60" cy="60" r="46" fill="url(#wax)" />
                <circle cx="60" cy="60" r="45" fill="url(#waxIn)" />
                <circle cx="21" cy="72" r="7" fill="url(#wax)" />
                <circle cx="98" cy="55" r="5.5" fill="url(#wax)" />
                <circle cx="76" cy="101" r="6" fill="url(#wax)" />
                <circle cx="38" cy="20" r="5" fill="url(#wax)" />
              </g>
              <g filter="url(#waxRough)" opacity="0.92">
                <circle cx="60" cy="60" r="33" fill="none" stroke={shade(primary, -24)} strokeWidth="1.6" opacity="0.55" />
                <text
                  x="60"
                  y="70"
                  textAnchor="middle"
                  fontFamily="Georgia, serif"
                  fontStyle="italic"
                  fontSize="26"
                  fill={shade(primary, -24)}
                  opacity="0.8"
                >
                  {coupleInitials}
                </text>
              </g>
              <ellipse cx="46" cy="38" rx="22" ry="13" fill="#ffffff" opacity="0.16" transform="rotate(-24 46 38)" />
            </svg>
          </button>

          {/* crack fragments — slow, 1100ms */}
          {[
            { cls: "f1", d: "M2 4 L12 2 L8 18 Z", tx: -130, ty: -95, r: -210, delay: 0 },
            { cls: "f2", d: "M6 2 L18 8 L10 18 Z", tx: 120, ty: -110, r: 160, delay: 60 },
            { cls: "f3", d: "M2 10 L14 4 L12 18 Z", tx: -60, ty: -150, r: 90, delay: 120 },
            { cls: "f4", d: "M8 2 L18 12 L4 16 Z", tx: 170, ty: -40, r: 260, delay: 40 },
          ].map((f) => (
            <svg
              key={f.cls}
              className="absolute left-1/2 top-1/2 h-5 w-5"
              viewBox="0 0 20 20"
              aria-hidden
              style={{
                opacity: 0,
                animation: sealBroken
                  ? `fly 1100ms cubic-bezier(0.25, 0.6, 0.3, 1) ${f.delay}ms forwards`
                  : "none",
                ["--tx" as string]: `${f.tx}px`,
                ["--ty" as string]: `${f.ty}px`,
                ["--r" as string]: `${f.r}deg`,
              }}
            >
              <path d={f.d} fill={shade(primary, -8)} />
            </svg>
          ))}
        </div>
      </div>

      {/* ——— fx overlay: brief blur + slower sparks, starts WITH the card ——— */}
      <div
        className="pointer-events-none fixed inset-0 z-30"
        style={{ opacity: fxOn ? 1 : 0, transition: `opacity 400ms ease` }}
      >
        <div
          className="absolute inset-0"
          style={{
            backdropFilter: fxOn ? "blur(10px)" : "blur(0px)",
            WebkitBackdropFilter: fxOn ? "blur(10px)" : "blur(0px)",
            background: fxOn
              ? "radial-gradient(circle at 50% 45%, rgba(255,248,238,.30), rgba(240,230,214,.45))"
              : "radial-gradient(circle at 50% 45%, rgba(255,248,238,.25), rgba(240,230,214,.4))",
            transition: `backdrop-filter 900ms cubic-bezier(0.4, 0, 0.2, 1), background 900ms cubic-bezier(0.4, 0, 0.2, 1)`,
          }}
        />
        {/* sparks — slower (1800ms), staggered up to 420ms */}
        {SPARKS.map((s, i) => (
          <span
            key={i}
            className="absolute left-1/2 top-[45%] h-[5px] w-[5px] rounded-full"
            aria-hidden
            style={{
              background: "radial-gradient(circle, #fff 0%, #ffe9c9 40%, rgba(255,220,170,0) 70%)",
              opacity: 0,
              animation: fxOn
                ? `sparkFly 1800ms cubic-bezier(0.22, 1, 0.36, 1) ${s.delay}ms forwards`
                : "none",
              ["--a" as string]: `${s.a}deg`,
              ["--d" as string]: `${s.d}px`,
              ["--s" as string]: `${s.s}`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

/** Spark burst definition: angle (deg), distance (px), scale, stagger (ms). */
const SPARKS: Array<{ a: number; d: number; s: number; delay: number }> = [
  { a: -150, d: 120, s: 1.4, delay: 0 },
  { a: -110, d: 170, s: 1.0, delay: 180 },
  { a: -60, d: 140, s: 1.6, delay: 80 },
  { a: -20, d: 190, s: 0.9, delay: 280 },
  { a: 15, d: 130, s: 1.3, delay: 120 },
  { a: 55, d: 175, s: 1.1, delay: 340 },
  { a: 95, d: 145, s: 1.5, delay: 40 },
  { a: 140, d: 185, s: 1.0, delay: 240 },
  { a: 185, d: 135, s: 1.45, delay: 380 },
  { a: 225, d: 165, s: 0.95, delay: 200 },
  { a: 265, d: 150, s: 1.35, delay: 320 },
  { a: 305, d: 180, s: 1.05, delay: 420 },
  { a: 345, d: 155, s: 1.2, delay: 140 },
];

/* ——— Tiny hex helpers (no external deps) ——— */

function clamp(v: number): number {
  return Math.min(255, Math.max(0, Math.round(v)));
}

/** shade(hex, percent): percent > 0 lightens, < 0 darkens. */
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

/** hexA(hex, alpha): hex → rgba() string. */
function hexA(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const num = parseInt(clean.length === 3 ? clean.replace(/(.)/g, "$1$1") : clean, 16);
  return `rgba(${num >> 16}, ${(num >> 8) & 0x00ff}, ${num & 0x0000ff}, ${alpha})`;
}

/** mix(hexA, hexB, weightA): linear blend of two hex colours (weightA 0..1). */
function mix(hexA_: string, hexB: string, weightA: number): string {
  const parse = (h: string) => {
    const c = h.replace("#", "");
    const n = parseInt(c.length === 3 ? c.replace(/(.)/g, "$1$1") : c, 16);
    return [n >> 16, (n >> 8) & 0x00ff, n & 0x0000ff] as const;
  };
  const [r1, g1, b1] = parse(hexA_);
  const [r2, g2, b2] = parse(hexB);
  const w = Math.min(1, Math.max(0, weightA));
  const r = Math.round(r1 * w + r2 * (1 - w));
  const g = Math.round(g1 * w + g2 * (1 - w));
  const b = Math.round(b1 * w + b2 * (1 - w));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}
