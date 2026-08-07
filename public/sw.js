/* Maiah's service worker intentionally avoids caching authenticated requests. */
self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
