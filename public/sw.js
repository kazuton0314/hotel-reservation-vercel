/**
 * 最小 PWA Service Worker（インストール要件のみ）
 * - 認証のバイパスや HTML/API のキャッシュは行わない
 * - fetch は常にネットワークへ（event.respondWith しない）
 */
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  /* Chrome の PWA インストール要件用。ネットワークをそのまま使う。 */
});
