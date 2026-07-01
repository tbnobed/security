---
name: Orval query enabled option
description: How to conditionally enable/disable generated Orval query hooks.
---

Generated Orval query hooks accept `options.query` typed as `UseQueryOptions<...>`, which in React Query v5 requires `queryKey`. Passing just `{ enabled: false }` causes a TS error.

**Fix:** Cast the query options to `any`:

```ts
const { refetch } = useCheckWatchlist(
  { name },
  { query: { enabled: false, retry: false } as any }
);

const { data } = useSearchGuests(
  { q: query },
  { query: { enabled: query.length >= 2 } as any }
);
```

**Why:** The generated type is `UseQueryOptions` (requires queryKey) but the hook internally injects queryKey — the cast is safe.

**How to apply:** Any `useXxx` query hook that needs conditional `enabled` or other query options should use `as any` on the inner `query` object.
