---
name: React Query auth redirect race
description: Post-login navigation must be driven reactively from auth state, not by imperative navigation immediately after the login call.
---

After a successful login that does `queryClient.setQueryData(["auth","me"], user)`, do NOT immediately call imperative navigation (e.g. wouter `setLocation("/dashboard")`).

**Symptom:** Login returns 200, but the app stays on the sign-in page. The imperative navigation runs before React commits the `setQueryData` update, so the protected route reads `isSignedIn === false` and bounces back to sign-in — where nothing re-triggers the redirect.

**Fix:** Redirect reactively. Read `isSignedIn` from the auth context in the sign-in page and `return <Redirect to="/dashboard" />` when true. Once the query cache commits, the component re-renders and navigates deterministically.

**Why:** `setQueryData` schedules an async React state update; imperative navigation in the same tick races ahead of that commit. Reactive redirects always fire after the state is visible.

**How to apply:** Any "do action → then navigate based on the resulting auth/query state" flow should gate navigation on the observed state, not sequence it right after the mutating call.
