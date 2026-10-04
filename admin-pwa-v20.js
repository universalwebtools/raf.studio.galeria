import { getApps, getApp, initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getDatabase, ref, set } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";
import { getMessaging, getToken, onMessage } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-messaging.js";
import { firebaseConfig, ADMIN_UID } from "./firebase-config.js?v=20.1";
import { VAPID_PUBLIC_KEY } from "./push-config.js?v=20.1";

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
let deferredInstallPrompt = null;
let swRegistration = null;
let foregroundListenerInstalled = false;

function isStandalone() {
  return window.matchMedia?.("(display-mode: standalone)")?.matches === true || window.navigator.standalone === true;
}
function isIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent || ""); }

function ensureHead() {
  let manifest = document.querySelector('link[rel="manifest"]');
  if (!manifest) {
    manifest = document.createElement("link");
    manifest.rel = "manifest";
    document.head.appendChild(manifest);
  }
  manifest.href = "/manifest.webmanifest?v=20.1";

  if (!document.querySelector('link[rel="apple-touch-icon"]')) {
    const icon = document.createElement("link");
    icon.rel = "apple-touch-icon";
    icon.href = "/app-icon-192.svg";
    document.head.appendChild(icon);
  }

  const metas = [
    ["apple-mobile-web-app-capable", "yes"],
    ["apple-mobile-web-app-status-bar-style", "black-translucent"],
    ["apple-mobile-web-app-title", "RAF Galeria"]
  ];
  for (const [name, content] of metas) {
    if (document.querySelector(`meta[name="${name}"]`)) continue;
    const meta = document.createElement("meta");
    meta.name = name;
    meta.content = content;
    document.head.appendChild(meta);
  }
}

function toast(message, timeout = 5200) {
  document.getElementById("rafPwaToast")?.remove();
  const el = document.createElement("div");
  el.id = "rafPwaToast";
  el.textContent = message;
  Object.assign(el.style, {
    position:"fixed", left:"50%", bottom:"24px", transform:"translateX(-50%)", zIndex:"99999",
    maxWidth:"min(92vw,620px)", padding:"13px 16px", borderRadius:"14px", border:"1px solid #3a3a40",
    background:"rgba(17,17,20,.97)", color:"#f4f4f2", boxShadow:"0 18px 60px #0008",
    fontSize:"13px", lineHeight:"1.45", textAlign:"center"
  });
  document.body.appendChild(el);
  setTimeout(() => el.remove(), timeout);
}

async function sha256(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(v => v.toString(16).padStart(2, "0")).join("");
}

async function waitForAdminUser(timeoutMs = 12000) {
  if (auth.currentUser?.uid === ADMIN_UID) return auth.currentUser;
  return new Promise((resolve, reject) => {
    let unsub = () => {};
    const timer = setTimeout(() => { unsub(); reject(new Error("Najpierw zaloguj się do panelu administratora.")); }, timeoutMs);
    unsub = onAuthStateChanged(auth, user => {
      if (user?.uid !== ADMIN_UID) return;
      clearTimeout(timer); unsub(); resolve(user);
    });
  });
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) throw new Error("Ta przeglądarka nie obsługuje aplikacji PWA.");
  if (swRegistration) return swRegistration;
  swRegistration = await navigator.serviceWorker.register("/firebase-messaging-sw.js?v=20.1", { scope:"/" });
  await navigator.serviceWorker.ready;
  return swRegistration;
}

function installForegroundListener() {
  if (foregroundListenerInstalled) return;
  foregroundListenerInstalled = true;
  try {
    const messaging = getMessaging(app);
    onMessage(messaging, payload => {
      const data = payload?.data || {};
      const title = data.title || "RAF.studio Galeria";
      const body = data.body || "Nowe zdarzenie w galerii klienta.";
      toast(`${title} — ${body}`, 8000);
      if (Notification.permission === "granted" && document.visibilityState === "visible") {
        try { new Notification(title, { body, icon:"/app-icon-192.svg", tag:data.tag || "raf-gallery-event" }); } catch (_) {}
      }
    });
  } catch (error) { console.warn("RAF PWA foreground messaging unavailable", error); }
}

async function enablePush(button) {
  try {
    button.disabled = true;
    button.textContent = "🔔 Konfiguruję…";
    await waitForAdminUser();

    if (!VAPID_PUBLIC_KEY) {
      toast("Brakuje publicznego klucza Web Push (VAPID). Wygeneruj go w Firebase → Ustawienia projektu → Cloud Messaging → Web Push certificates.", 10000);
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission !== "granted") throw new Error("Nie udzielono zgody na powiadomienia.");

    const registration = await registerServiceWorker();
    const messaging = getMessaging(app);
    const token = await getToken(messaging, { vapidKey: VAPID_PUBLIC_KEY, serviceWorkerRegistration: registration });
    if (!token) throw new Error("Firebase nie zwrócił tokenu powiadomień.");

    const key = await sha256(token);
    await set(ref(db, `adminPushTokens/${ADMIN_UID}/${key}`), {
      token, createdAt:Date.now(), lastSeenAt:Date.now(), platform:navigator.platform || "", userAgent:navigator.userAgent || ""
    });

    localStorage.setItem("raf-push-enabled", "1");
    button.textContent = "🔔 Push włączony";
    button.dataset.enabled = "1";
    toast("Powiadomienia PUSH są włączone na tym urządzeniu ✅");
    installForegroundListener();
  } catch (error) {
    console.error("RAF PWA PUSH ERROR", error);
    toast(`Nie udało się włączyć PUSH: ${error?.message || error}`);
  } finally {
    button.disabled = false;
    if (button.dataset.enabled !== "1") button.textContent = "🔔 Włącz powiadomienia";
  }
}

async function installApp() {
  if (isStandalone()) {
    toast("RAF.studio Galeria jest już uruchomiona jako aplikacja.");
    return;
  }

  if (deferredInstallPrompt) {
    const prompt = deferredInstallPrompt;
    deferredInstallPrompt = null;
    await prompt.prompt();
    const result = await prompt.userChoice;
    if (result?.outcome === "accepted") toast("Aplikacja RAF.studio Galeria została zainstalowana ✅");
    return;
  }

  if (isIOS()) {
    toast("Na iPhone/iPad instalacja odbywa się przez Udostępnij → Dodaj do ekranu początkowego. Po instalacji aplikacja otworzy się bez paska przeglądarki.", 10000);
    return;
  }

  // Dedicated page has the manifest in HTML from the first byte of page load,
  // so Chromium can evaluate installability before the user taps Install.
  location.href = "/install.html?from=admin";
}

function ensureStyles() {
  if (document.getElementById("rafPwaStyles")) return;
  const style = document.createElement("style");
  style.id = "rafPwaStyles";
  style.textContent = `
    #installRafAppBtn,#enableRafPushBtn{white-space:nowrap}
    #enableRafPushBtn[data-enabled="1"]{border-color:#315b3d!important;color:#b9efc4!important;background:#102015!important}
    @media(max-width:760px){#installRafAppBtn,#enableRafPushBtn{width:100%}}
  `;
  document.head.appendChild(style);
}

async function ensureButtons() {
  for (let i=0;i<160;i++) {
    const actions = document.querySelector(".admin-head-actions");
    if (actions) {
      if (!document.getElementById("installRafAppBtn")) {
        const install = document.createElement("button");
        install.id = "installRafAppBtn";
        install.type = "button";
        install.className = "ghost";
        install.textContent = isStandalone() ? "📱 Aplikacja zainstalowana" : "📲 Zainstaluj aplikację";
        install.addEventListener("click", installApp);
        actions.prepend(install);
      }
      if (!document.getElementById("enableRafPushBtn")) {
        const push = document.createElement("button");
        push.id = "enableRafPushBtn";
        push.type = "button";
        push.className = "ghost";
        const enabled = localStorage.getItem("raf-push-enabled") === "1" && Notification.permission === "granted";
        push.dataset.enabled = enabled ? "1" : "0";
        push.textContent = enabled ? "🔔 Push włączony" : "🔔 Włącz powiadomienia";
        push.addEventListener("click", () => enablePush(push));
        actions.prepend(push);
      }
      return;
    }
    await new Promise(resolve => setTimeout(resolve,50));
  }
}

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  deferredInstallPrompt = event;
  const button = document.getElementById("installRafAppBtn");
  if (button && !isStandalone()) button.textContent = "📲 Zainstaluj aplikację";
});
window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  const button = document.getElementById("installRafAppBtn");
  if (button) button.textContent = "📱 Aplikacja zainstalowana";
  toast("RAF.studio Galeria została zainstalowana jako aplikacja ✅");
});

async function init() {
  ensureHead(); ensureStyles();
  try { await registerServiceWorker(); } catch (error) { console.warn("RAF PWA service worker unavailable", error); }
  await ensureButtons();
  if (Notification.permission === "granted" && VAPID_PUBLIC_KEY) installForegroundListener();
}
init();
