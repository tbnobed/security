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
