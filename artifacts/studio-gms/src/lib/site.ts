// The site (campus/building) this deployment serves. Static for phase 1 —
// set via the VITE_SITE_NAME env var (see .env). All check-in / pre-registration
// records are stamped with this value; studios (rooms within the site) are
// selectable per-visit and managed by admins.
export const SITE_NAME = import.meta.env.VITE_SITE_NAME?.trim() || "Studio";
