---
name: Orval mutation call shape
description: How to call generated Orval mutation hooks in this codebase.
---

Orval-generated mutations in this repo wrap body payloads in a `data` key:

```ts
// Body mutation
await createGuest({ data: { name, company, ... } });
await uploadPhoto({ data: { imageData: base64 } });

// ID-only mutation (no body)
await checkoutGuest({ id: guestId });
await deletePreregistration({ id });

// Combined ID + body
await updateUserRole({ clerkId, data: { role } });
```

**Why:** Orval separates path params from body to avoid collision and keep types accurate.

**How to apply:** Any time you call a generated mutation hook, check whether it expects `{ data: T }`, `{ id: N }`, or both. Never spread the body directly as the top-level argument.
