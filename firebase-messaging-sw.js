/* RAF.studio Galeria PWA + Firebase Cloud Messaging service worker */
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

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));

messaging.onBackgroundMessage(payload => {
  const data = payload?.data || {};
  const title = data.title || "RAF.studio Galeria";
  const options = {
    body: data.body || "Nowe zdarzenie w galerii klienta.",
    icon: "/logo-black.png",
    badge: "/logo-black.png",
    tag: data.tag || `raf-gallery-${data.galleryId || "event"}`,
    renotify: true,
    data: {
      url: data.url || "/admin/",
      galleryId: data.galleryId || "",
      approvalId: data.approvalId || ""
    }
  };
  return self.registration.showNotification(title, options);
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const targetUrl = new URL(event.notification?.data?.url || "/admin/", self.location.origin).href;

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
