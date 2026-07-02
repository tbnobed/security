// Minimal service worker — its only job is to make the app installable as a
// PWA (Chrome requires a registered service worker with a fetch handler before
// it offers "Install app"). It intentionally does NOT cache app assets, so
// there is zero risk of serving stale code after a new deploy: every request
// falls through to the network exactly as if the SW were not present.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // No-op: required for installability. Requests are handled by the browser
  // normally (no respondWith == pass-through to network).
});
