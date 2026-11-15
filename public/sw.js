// Minimal service worker: makes Syncly installable (required for the share target).
// It deliberately does not cache app pages or files, so private data never sits in a shared cache.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
