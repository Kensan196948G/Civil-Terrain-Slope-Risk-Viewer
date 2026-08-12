/* global self, caches, URL, fetch */
/* Service Worker: アプリシェル (同一オリジンの静的アセット) のオフラインキャッシュ。
 *
 * 方針:
 * - API (/api/*) と外部タイル (GSI等) はキャッシュしない。動的データを古い
 *   値で表示すると「データなし≠安全」の原則を壊すため。
 * - ナビゲーションは network-first + index.html フォールバック。
 * - 同一オリジン静的アセットは cache-first (バージョン付き /assets/*)。
 * - 新しい SW は即時 active にし、旧キャッシュは破棄する。
 */
const CACHE_NAME = "civil-terrain-shell-v1";
const APP_SHELL = ["/", "/index.html", "/manifest.webmanifest", "/favicon.svg", "/favicon.ico"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") {
    return;
  }
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("/index.html", copy));
          return response;
        })
        .catch(() => caches.match("/index.html").then((cached) => cached ?? caches.match("/"))),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ??
        fetch(request).then((response) => {
          if (response.ok && url.pathname.startsWith("/assets/")) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
