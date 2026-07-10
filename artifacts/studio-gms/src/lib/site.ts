// The site (campus/building) this deployment serves. Static for phase 1 —
// set via the VITE_SITE_NAME env var (see .env). All check-in / pre-registration
// records are stamped with this value; studios (rooms within the site) are
// selectable per-visit and managed by admins.
export const SITE_NAME = import.meta.env.VITE_SITE_NAME?.trim() || "Studio";

// Client branding for the PUBLIC pre-registration page (the page visitors see).
// Swap these per client without touching code:
//   VITE_CLIENT_NAME — client display name shown under the logo (falls back to SITE_NAME)
//   VITE_CLIENT_LOGO — client logo. Either a filename placed in `public/`
//                      (e.g. "client-logo.png") or a full URL. Empty = show the
//                      default FrontDesk mark instead.
export const CLIENT_NAME = import.meta.env.VITE_CLIENT_NAME?.trim() || "";

const rawClientLogo = import.meta.env.VITE_CLIENT_LOGO?.trim() || "";
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

// Resolve the client logo to a usable URL: pass through absolute URLs, otherwise
// serve the file from the app's public directory under the current base path.
export const CLIENT_LOGO_URL = rawClientLogo
  ? /^https?:\/\//.test(rawClientLogo)
    ? rawClientLogo
    : `${basePath}/${rawClientLogo.replace(/^\//, "")}`
  : "";

// Privacy notice configuration (shown on the public /privacy page):
//   VITE_PRIVACY_CONTACT   — who to contact for privacy/data requests (email or
//                            instructions). Blank = "the security desk".
//   VITE_PRIVACY_RETENTION — human-readable retention statement, e.g.
//                            "Visitor records are retained for 24 months."
//                            Blank = generic "as long as needed" wording.
export const PRIVACY_CONTACT = import.meta.env.VITE_PRIVACY_CONTACT?.trim() || "";
export const PRIVACY_RETENTION = import.meta.env.VITE_PRIVACY_RETENTION?.trim() || "";

// DEFAULT printed-badge dimensions for a fresh browser. Badge/label size is a
// PER-WORKSTATION setting chosen in-app and stored per-browser (see
// lib/badge-size.ts) because different security desks at the same site can have
// different label printers. These env vars only seed that default:
//   VITE_BADGE_WIDTH  — badge width  (default "3in")
//   VITE_BADGE_HEIGHT — badge height (default "2in")
// Accepts a CSS length in in/mm/cm (e.g. "2.4in", "62mm"); the same units the
// runtime validator (isValidBadgeLength) accepts. Values are validated to a
// strict length pattern because they can be interpolated into an injected @page
// CSS rule (see print-badge.ts).
function badgeDimension(value: string | undefined, fallback: string): string {
  const t = (value ?? "").trim();
  return /^\d*\.?\d+(in|mm|cm)$/.test(t) ? t : fallback;
}
export const BADGE_WIDTH = badgeDimension(import.meta.env.VITE_BADGE_WIDTH, "3in");
export const BADGE_HEIGHT = badgeDimension(import.meta.env.VITE_BADGE_HEIGHT, "2in");
