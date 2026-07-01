---
name: DB lib stale declarations
description: How to fix "Module has no exported member" errors from @workspace/db after schema changes.
---

When new tables or exports are added to `lib/db/src/schema/`, the TypeScript declaration cache can be stale. Leaf artifacts (`api-server`, `studio-gms`) will report errors like `Module '@workspace/db' has no exported member 'guestsTable'` even though the export exists in source.

**Fix:** Run `pnpm run typecheck:libs` from the workspace root to rebuild lib declarations before running leaf artifact typechecks.

**Why:** `lib/db` is a composite TypeScript project — its `.d.ts` files are emitted to `dist/`. If those are stale, leaf packages see the old declarations.

**How to apply:** Whenever adding new exports to any `lib/*` package, always rebuild libs first: `pnpm run typecheck:libs`.
