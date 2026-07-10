import { useSyncExternalStore } from "react";
import { BADGE_HEIGHT, BADGE_WIDTH } from "@/lib/site";

// Printed visitor-badge label size. This is a PER-WORKSTATION setting, not a
// per-deployment one: different security desks (browsers) at the same site may
// have different label printers, so each machine picks its own size and it is
// remembered in that browser's localStorage. The env vars (VITE_BADGE_WIDTH/
// HEIGHT via lib/site.ts) only provide the initial default for a fresh browser.

export interface BadgeSize {
  width: string;
  height: string;
}

const STORAGE_KEY = "frontdesk.badgeSize";
const EVENT = "frontdesk:badge-size";

// Common label media. Sizes are the physical badge dimensions in the badge's
// own orientation; the label shown to the operator names the real-world stock.
export const BADGE_SIZE_PRESETS: { label: string; width: string; height: string }[] = [
  { label: '3" × 2" — landscape badge (default)', width: "3in", height: "2in" },
  { label: '2.4" × 3.5" — 62mm roll, portrait', width: "2.4in", height: "3.5in" },
  { label: '2.4" × 3.9" — 62mm × 100mm die-cut', width: "2.4in", height: "3.9in" },
  { label: '4" × 3" — large landscape', width: "4in", height: "3in" },
  { label: '4" × 2" — wide landscape', width: "4in", height: "2in" },
];

// Values become inline styles AND an injected @page rule (see print-badge.ts),
// so only accept a strict CSS length in in/mm/cm.
export function isValidBadgeLength(value: string): boolean {
  return /^\d*\.?\d+(in|mm|cm)$/.test(value.trim());
}

// Forgiving normalization for operator-typed input: lowercase, strip spaces,
// and treat a bare number as inches (so "2.4" -> "2.4in", "2.4 IN" -> "2.4in").
// The result is re-validated by isValidBadgeLength before it's ever stored or
// interpolated, so this never weakens the interpolation-safety guarantee.
export function normalizeBadgeLength(value: string): string {
  const t = value.trim().toLowerCase().replace(/\s+/g, "");
  if (/^\d*\.?\d+$/.test(t)) return `${t}in`;
  return t;
}

export const DEFAULT_BADGE_SIZE: BadgeSize = { width: BADGE_WIDTH, height: BADGE_HEIGHT };

function read(): BadgeSize {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_BADGE_SIZE;
    const parsed = JSON.parse(raw) as Partial<BadgeSize>;
    const width = typeof parsed.width === "string" && isValidBadgeLength(parsed.width) ? parsed.width : DEFAULT_BADGE_SIZE.width;
    const height = typeof parsed.height === "string" && isValidBadgeLength(parsed.height) ? parsed.height : DEFAULT_BADGE_SIZE.height;
    return { width, height };
  } catch {
    return DEFAULT_BADGE_SIZE;
  }
}

// Cache so useSyncExternalStore gets a stable snapshot reference between changes
// (returning a fresh object every getSnapshot call causes an infinite loop).
let cache: BadgeSize = typeof window !== "undefined" ? read() : DEFAULT_BADGE_SIZE;

export function getBadgeSize(): BadgeSize {
  return cache;
}

export function setBadgeSize(size: BadgeSize): void {
  if (!isValidBadgeLength(size.width) || !isValidBadgeLength(size.height)) return;
  cache = { width: size.width.trim(), height: size.height.trim() };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    /* storage may be unavailable (private mode) — keep the in-memory value */
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void): () => void {
  // Same-tab changes: setBadgeSize already updated `cache`, so just notify. Do
  // NOT re-read here — if localStorage.setItem failed (private mode), read()
  // would fall back to the default and clobber the just-set in-memory value.
  const onLocal = () => cb();
  // Cross-tab changes: another tab wrote localStorage, so refresh from it.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY) return;
    cache = read();
    cb();
  };
  window.addEventListener(EVENT, onLocal);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, onLocal);
    window.removeEventListener("storage", onStorage);
  };
}

export function useBadgeSize(): BadgeSize {
  return useSyncExternalStore(subscribe, getBadgeSize, () => DEFAULT_BADGE_SIZE);
}
