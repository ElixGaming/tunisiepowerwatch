const CACHE_NAME = "tpw-shell-v27";

const APP_SHELL = [
  "/",
  "/index.html",

  "/styles.css?v=17",
  "/app.js?v=26",
  "/i18n.js?v=21",
  "/pwa.js?v=1",
  "/steg-zones.js?v=2",

  "/cookie-consent.js?v=5",

  "/data/tn-imadas.geojson?v=1",

  "/vendor/leaflet/leaflet.css",
  "/vendor/leaflet/leaflet.js",
  "/vendor/altcha/altcha.js?v=3.2.1",

  "/assets/tn-power-watch.png",

  "/privacy.html",
  "/privacy.js",

  "/cookies.html",

  "/legal.html",
  "/legal.js",

  "/terms.html",

  "/qr-codes.html",
  "/qr-codes.js?v=2",

  "/status.html",
  "/status.js?v=3",

  "/public.html",
  "/public-dashboard.js?v=2"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  if (
    url.origin !== location.origin ||
    url.pathname.startsWith("/api/") ||
    url.pathname === "/ws"
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();

          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, copy);
          });
        }

        return response;
      })
      .catch(() =>
        caches
          .match(event.request)
          .then(
            (cached) =>
              cached || caches.match("/index.html")
          )
      )
  );
});

self.addEventListener("push", (event) => {
  const data = event.data?.json() || {};

  event.waitUntil(
    self.registration.showNotification(
      data.title || "Tunisie Power Watch",
      {
        body:
          data.body ||
          "Nouvelle information dans votre zone.",

        icon: "/assets/tn-power-watch.png",
        badge: "/assets/tn-power-watch.png",

        tag: data.zoneId
          ? `tpw-${data.zoneId}`
          : "tpw-update",

        data: {
          url: data.url || "/"
        }
      }
    )
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = new URL(
    event.notification.data?.url || "/",
    self.location.origin
  ).href;

  event.waitUntil(
    self.clients
      .matchAll({
        type: "window",
        includeUncontrolled: true
      })
      .then((clients) => {
        const existing = clients.find((client) =>
          client.url.startsWith(self.location.origin)
        );

        if (existing) {
          return existing
            .navigate(targetUrl)
            .then(() => existing.focus());
        }

        return self.clients.openWindow(targetUrl);
      })
  );
});