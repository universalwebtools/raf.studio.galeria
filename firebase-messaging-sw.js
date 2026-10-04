/* RAF.studio Galeria PWA + Firebase Cloud Messaging service worker v20.1 */
importScripts("https://www.gstatic.com/firebasejs/12.2.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.2.1/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyB3dwyRdq6dcgl-_yhK-9QEgufA3RLpPG0",
  authDomain: "rafstudiogaleria.firebaseapp.com",
  databaseURL: "https://rafstudiogaleria-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "rafstudiogaleria",
  storageBucket: "rafstudiogaleria.firebasestorage.app",
  messagingSenderId: "53550728942",
  appId: "1:53550728942:web:dbcf91a86807ada97d15ff",
  measurementId: "G-GJ9LZR48BT"
});

const messaging = firebase.messaging();
const CACHE_NAME = "raf-studio-galeria-pwa-v20.1";
const APP_SHELL = [
  "/admin.html",
  "/install.html",
  "/manifest.webmanifest",
  "/app-icon-192.svg",
  "/app-icon-512.svg",
  "/style.css"
];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(APP_SHELL);
    } catch (_) {}
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith("raf-studio-galeria-pwa-") && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    try {
      const response = await fetch(event.request);
      if (response && response.ok) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(event.request, response.clone()).catch(() => {});
      }
      return response;
    } catch (_) {
      const cached = await caches.match(event.request, { ignoreSearch: true });
      if (cached) return cached;
      if (event.request.mode === "navigate") {
        const fallback = await caches.match("/admin.html");
        if (fallback) return fallback;
      }
      throw _;
    }
  })());
});

messaging.onBackgroundMessage(payload => {
  const data = payload?.data || {};
  const title = data.title || "RAF.studio Galeria";
  const options = {
    body: data.body || "Nowe zdarzenie w galerii klienta.",
    icon: "/app-icon-192.svg",
    badge: "/app-icon-192.svg",
    tag: data.tag || `raf-gallery-${data.galleryId || "event"}`,
    renotify: true,
    data: {
      url: data.url || "/admin.html?source=push",
      galleryId: data.galleryId || "",
      approvalId: data.approvalId || ""
    }
  };
  return self.registration.showNotification(title, options);
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const targetUrl = new URL(event.notification?.data?.url || "/admin.html?source=push", self.location.origin).href;

  event.waitUntil((async () => {
    const windows = await clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if ("focus" in client) {
        try { await client.navigate(targetUrl); } catch (_) {}
        return client.focus();
      }
    }
    return clients.openWindow(targetUrl);
  })());
});
