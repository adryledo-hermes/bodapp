/**
 * Pure, typed helpers for the decoration & gift placement layer. No React/Next
 * imports here so this module is unit-testable and free of server/client
 * concerns (mirrors src/lib/seating.ts).
 */

/** The supported decoration/gift zone kinds. */
export type DecorationKind =
  | "centerpiece"
  | "giftTable"
  | "photoWall"
  | "danceFloor"
  | "other";

/** Display metadata for a kind: Spanish label + emoji glyph. */
export interface DecorationKindMeta {
  label: string;
  emoji: string;
}

/** Record of every supported kind -> its display metadata. */
export const DECORATION_KINDS: Record<DecorationKind, DecorationKindMeta> = {
  centerpiece: { label: "Centro de mesa", emoji: "🕯️" },
  giftTable: { label: "Mesa de regalos", emoji: "🎁" },
  photoWall: { label: "Photocall", emoji: "📸" },
  danceFloor: { label: "Pista de baile", emoji: "🪩" },
  other: { label: "Otro", emoji: "✨" },
};

/** Deterministic ordering for dropdowns / lists. */
export const DECORATION_KIND_ORDER: DecorationKind[] = [
  "centerpiece",
  "giftTable",
  "photoWall",
  "danceFloor",
  "other",
];

/** Type guard for the kind union. */
export function isDecorationKind(value: string | null | undefined): value is DecorationKind {
  return !!value && value in DECORATION_KINDS;
}

/** A position on the canvas (0..canvas dimension). */
export interface DecorationPosition {
  positionX: number;
  positionY: number;
}

/** The accepted source shape for normalization (loose, from the DB/UI). */
export interface RawDecoration {
  kind?: string | null;
  label?: string | null;
  positionX?: number | null;
  positionY?: number | null;
}

/** A decoration with all fields normalized to safe, UI-ready values. */
export interface NormalizedDecoration {
  kind: DecorationKind;
  label: string;
  positionX: number;
  positionY: number;
}

/**
 * Clamp a linear coordinate so it is never negative (keeps items on-canvas).
 */
function clampCoord(value: number | null | undefined): number {
  return Math.max(0, typeof value === "number" && Number.isFinite(value) ? value : 0);
}

/**
 * Normalize a decoration row: coerce the kind to a known union member (default
 * "other"), clamp positions to >= 0, and fall back to the kind's label when no
 * custom label is provided.
 */
export function normalizeDecoration(d: RawDecoration): NormalizedDecoration {
  const kind: DecorationKind = isDecorationKind(d.kind) ? d.kind : "other";
  const trimmed = d.label?.trim();
  const label = trimmed ? trimmed : DECORATION_KINDS[kind].label;
  return {
    kind,
    label,
    positionX: clampCoord(d.positionX),
    positionY: clampCoord(d.positionY),
  };
}

/**
 * Compute a sensible default position for a newly-added decoration so items
 * don't stack on top of each other: new items are spread across a grid that
 * sits inside the canvas with a margin on every edge. The returned coordinates
 * are in the same units as the canvas width/height arguments.
 */
export function defaultKindPosition(
  canvasW: number,
  canvasH: number,
  index: number
): DecorationPosition {
  const margin = 12; // reserved band from each edge (same units as canvasW/H)
  const cols = 3;
  const rows = 3;
  const usableW = Math.max(0, canvasW - margin * 2);
  const usableH = Math.max(0, canvasH - margin * 2);
  const cellW = usableW / cols;
  const cellH = usableH / rows;
  const row = Math.floor(index / cols) % rows;
  const col = index % cols;
  const positionX = Math.round((margin + cellW * col + cellW / 2) * 10) / 10;
  const positionY = Math.round((margin + cellH * row + cellH / 2) * 10) / 10;
  return { positionX, positionY };
}
