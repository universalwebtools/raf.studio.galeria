import { getApps, getApp, initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getDatabase, ref, set } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";
import { getMessaging, getToken, onMessage } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-messaging.js";
import { firebaseConfig, ADMIN_UID } from "./firebase-config.js?v=20.3";
import { VAPID_PUBLIC_KEY } from "./push-config.js?v=20.3";

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
let foregroundInstalled = false;

function toast(message, timeout = 6500) {
  document.getElementById("rafPushToast")?.remove();
  const el = document.createElement("div");
  el.id = "rafPushToast";
  el.textContent = message;
  Object.assign(el.style, {
    position: "fixed",
    left: "50%",
    bottom: "24px",
    transform: "translateX(-50%)",
    zIndex: "999999",
    maxWidth: "min(92vw,620px)",
    padding: "13px 16px",
    borderRadius: "14px",
    border: "1px solid #3a3a40",
    background: "rgba(17,17,20,.98)",
    color: "#f4f4f2",
    boxShadow: "0 18px 60px #0008",
    fontSize: "13px",
    lineHeight: "1.45",
    textAlign: "center"
  });
  document.body.appendChild(el);
  setTimeout(() => el.remove(), timeout);
}

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map(v => v.toString(16).padStart(2, "0")).join("");
}

async function waitForAdmin(timeoutMs = 12000) {
  if (auth.currentUser?.uid === ADMIN_UID) return auth.currentUser;
  return new Promise((resolve, reject) => {
    let unsub = () => {};
    const timer = setTimeout(() => {
      unsub();
      reject(new Error("Najpierw zaloguj się do panelu administratora."));
    }, timeoutMs);
    unsub = onAuthStateChanged(auth, user => {
      if (user?.uid !== ADMIN_UID) return;
      clearTimeout(timer);
      unsub();
      resolve(user);
    });
  });
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) throw new Error("Ta przeglądarka nie obsługuje Service Worker.");
  const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js?v=20.3", { scope: "/" });
  await navigator.serviceWorker.ready;
  return registration;
}

function installForegroundListener() {
  if (foregroundInstalled) return;
  foregroundInstalled = true;
  try {
    const messaging = getMessaging(app);
    onMessage(messaging, payload => {
      const data = payload?.data || {};
      const title = data.title || "RAF.studio Galeria";
      const body = data.body || "Nowe zdarzenie w galerii klienta.";
      toast(`${title} — ${body}`, 9000);
      if (Notification.permission === "granted") {
        try {
          new Notification(title, {
            body,
            icon: "/app-icon-192.png?v=20.3",
            tag: data.tag || "raf-gallery-event"
          });
        } catch (_) {}
      }
    });
  } catch (error) {
    console.warn("Foreground FCM unavailable", error);
  }
}

async function enablePush(button) {
  try {
    button.disabled = true;
    button.textContent = "🔔 Konfiguruję…";

    await waitForAdmin();

    if (!VAPID_PUBLIC_KEY) throw new Error("Brakuje klucza VAPID.");

    const permission = await Notification.requestPermission();
    if (permission !== "granted") throw new Error("Nie udzielono zgody na powiadomienia.");

    const registration = await registerServiceWorker();
    const messaging = getMessaging(app);
    const token = await getToken(messaging, {
      vapidKey: VAPID_PUBLIC_KEY,
      serviceWorkerRegistration: registration
    });

    if (!token) throw new Error("Firebase nie zwrócił tokenu urządzenia.");

    const tokenKey = await sha256(token);
    await set(ref(db, `galleries/__system__/adminPushTokens/${tokenKey}`), {
      token,
      createdAt: Date.now(),
      lastSeenAt: Date.now(),
      platform: navigator.platform || "",
      userAgent: navigator.userAgent || "",
      adminUid: ADMIN_UID
    });

    localStorage.setItem("raf-push-enabled", "1");
    button.dataset.enabled = "1";
    button.textContent = "🔔 Push włączony";
    toast("Powiadomienia PUSH są aktywne na tym telefonie ✅");
    installForegroundListener();
  } catch (error) {
    console.error("RAF PUSH ERROR", error);
    button.dataset.enabled = "0";
    button.textContent = "🔔 Włącz powiadomienia";
    toast(`Nie udało się włączyć PUSH: ${error?.message || error}`, 9000);
  } finally {
    button.disabled = false;
  }
}

async function bindButton() {
  for (let i = 0; i < 160; i++) {
    const actions = document.querySelector(".admin-head-actions");
    if (actions) {
      let button = document.getElementById("enableRafPushBtn");

      // Jeżeli starszy moduł dodał przycisk, klonujemy go, żeby usunąć stary listener.
      if (button) {
        const clean = button.cloneNode(true);
        button.replaceWith(clean);
        button = clean;
      } else {
        button = document.createElement("button");
        button.id = "enableRafPushBtn";
        button.type = "button";
        button.className = "ghost";
        actions.prepend(button);
      }

      const enabled = localStorage.getItem("raf-push-enabled") === "1" && Notification.permission === "granted";
      button.dataset.enabled = enabled ? "1" : "0";
      button.textContent = enabled ? "🔔 Push włączony" : "🔔 Włącz powiadomienia";
      button.addEventListener("click", () => enablePush(button));

      if (enabled) installForegroundListener();
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}

bindButton();
