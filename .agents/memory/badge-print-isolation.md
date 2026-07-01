---
name: Badge print isolation
description: How to reliably print a fixed-size card that lives inside a Radix dialog, and where runtime photo PII must not be committed.
---

# Printing a fixed-size card from inside a Radix dialog

**Rule:** Do NOT use plain `window.print()` for a card rendered inside a Radix dialog (or any portal/transformed container). The dialog's portal + CSS transforms break `@page`/positioning, so the print output is misaligned or clipped.

**Working pattern (FrontDesk visitor badge, 3in × 2in landscape):**
- The badge card carries a stable id (`id="print-badge"`).
- A helper `printBadge()` clones that node into a fresh `#print-root` appended directly to `<body>` (escaping the dialog's stacking/transform context), toggles a `body.printing-badge` class, calls `window.print()`, then cleans up on `afterprint` plus a ~1s timeout fallback.
- An `@media print` block (in the app's `index.css`) sets `@page { size: 3in 2in }` and hides everything except `#print-root`.

**Why:** The clone-to-body + body-class isolation is what makes the print reliable across the dialog boundary; the timeout fallback covers browsers that don't fire `afterprint`.

**How to apply:** Reuse this whenever a printable artifact must render inside a modal. Keep the printable node's id stable and let a single helper own the clone/isolate/cleanup lifecycle.

# Runtime photo PII must never be tracked

Visitor photos are written at runtime to `artifacts/api-server/uploads/` (auto-created by `src/lib/badge.ts`). This directory is gitignored — it holds biometric/PII data. A code review caught a stray runtime photo staged for commit. Never commit anything under an uploads/runtime-media directory; add the ignore rule up front when introducing file uploads.
