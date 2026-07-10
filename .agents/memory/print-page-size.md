---
name: Print @page size must be injected at print time
description: Why printed-label sizing uses an injected <style> reading data-* attrs instead of CSS variables, and the per-workstation storage model behind it.
---

# Printed badge/label sizing

The `@page { size: W H }` at-rule **cannot read CSS custom properties / variables** — `@page { size: var(--w) }` is ignored and the browser falls back to default paper, shrinking the content into a corner. So to size a printed label to arbitrary per-user dimensions you must **inject a `<style>` element with a literal `@page { size: <w> <h>; margin:0 }` at print time** and remove it after `afterprint`. The badge element carries its size in `data-badge-width`/`data-badge-height` attrs; `printBadge()` reads those and builds the rule.

**Why per-workstation, not per-deployment:** label size is stored in `localStorage` (`frontdesk.badgeSize`), not a build-time env var, because different security desks (browsers) at the same site have different label printers. Env `VITE_BADGE_WIDTH/HEIGHT` only seed the default for a fresh browser.

**Security:** the dimension strings are interpolated into injected CSS, so they MUST pass a strict length validator (`isValidBadgeLength`: `^\d*\.?\d+(in|mm|cm)$`) at every entry point (env default in `lib/site.ts`, runtime setter/UI in `lib/badge-size.ts`). Keep the accepted units identical across all validators.

**useSyncExternalStore gotchas** (the `useBadgeSize` store):
- `getSnapshot` must return a **cached, stable object reference** between changes, or React infinite-loops. Keep a module-level `cache` and only replace it on an actual change.
- The same-tab custom-event handler must NOT re-`read()` from localStorage — the setter already updated `cache`, and if `setItem` threw (private mode) a re-read would fall back to the default and clobber the in-memory value. Only the cross-tab `storage` event should re-read.
