// Panel admina: ustawienia Strefy klienta (kontakt, stopka, opinia Google)
// oraz filmy w galerii klienta (link YouTube/Vimeo albo plik wideo).
import { getApps, getApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getDatabase, ref, get, update, push, set, remove } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";
import { getStorage, ref as sRef, uploadBytesResumable, deleteObject } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js";
import { ADMIN_UID } from "./firebase-config.js?v=17.0";

const ZONE_CONFIG_PATH = "galleries/__system__/public/clientZoneConfig";
const $ = (selector, root = document) => root.querySelector(selector);

let db, storage, auth;

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([key, value]) => {
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else if (value !== undefined && value !== null && value !== false) node.setAttribute(key, value === true ? "" : value);
  });
  children.flat().filter(Boolean).forEach(child => node.append(child));
  return node;
}

function injectStyles() {
  if ($("#rafExtrasStyles")) return;
  const style = el("style", { id: "rafExtrasStyles" });
  style.textContent = `
    .rx-dialog{width:min(720px,calc(100% - 20px));max-height:92vh;padding:0;border:1px solid #33333a;border-radius:22px;background:#111113;color:#f5f5f2}
    .rx-dialog::backdrop{background:#000c;backdrop-filter:blur(6px)}
    .rx-in{padding:24px;display:grid;gap:14px}
    .rx-head{display:flex;justify-content:space-between;align-items:start;gap:12px}.rx-head h2{margin:4px 0;font-size:26px}.rx-head p{margin:0;color:#8e8e95;font-size:13px}
    .rx-in label{display:grid;gap:6px;font-size:13px;font-weight:700;color:#dedee3}
    .rx-in input{width:100%;box-sizing:border-box;border:1px solid #34343a;border-radius:12px;background:#0e0e10;color:#f4f4f2;padding:11px 12px;font:500 14px system-ui}
    .rx-hint{font-size:12px;color:#85858d;font-weight:500;margin:0}
    .rx-actions{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap}
    .rx-status{font-size:13px;padding:10px 12px;border-radius:10px;background:#18181b}.rx-status.ok{color:#9be3b5}.rx-status.err{color:#ff9b9b}
    .rx-list{display:grid;gap:8px}.rx-item{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid #2c2c31;border-radius:12px;background:#0f0f11}
    .rx-item div{flex:1;min-width:0}.rx-item strong{display:block}.rx-item small{color:#85858d;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .rx-row{display:grid;grid-template-columns:1fr 1.4fr auto;gap:8px;align-items:end}
    .rx-bar{height:6px;border-radius:9px;background:#29292d;overflow:hidden}.rx-bar i{display:block;height:100%;width:0;background:#f5f5f2}
    @media(max-width:640px){.rx-row{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
}

function status(node, text, kind = "") {
  node.hidden = !text;
  node.className = `rx-status ${kind}`;
  node.textContent = text;
}

function httpsOrEmpty(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    const url = new URL(text);
    if (url.protocol !== "https:") throw new Error();
    return url.href;
  } catch (_) {
    throw new Error(`To nie jest poprawny link https: ${text}`);
  }
}

// ------------------------------------------------------------ Strefa klienta

function buildSettingsDialog() {
  const fields = {
    googleReviewUrl: el("input", { type: "url", placeholder: "https://g.page/r/.../review" }),
    contactEmail: el("input", { type: "email", placeholder: "adres@przyklad.pl" }),
    contactInstagram: el("input", { type: "url", placeholder: "https://instagram.com/..." }),
    copyrightText: el("input", { type: "text", placeholder: "© RAF.studio" })
  };
  const msg = el("div", { class: "rx-status", hidden: true });
  const dialog = el("dialog", { id: "rxSettingsDialog", class: "rx-dialog" },
    el("div", { class: "rx-in" },
      el("div", { class: "rx-head" },
        el("div", {}, el("p", { class: "eyebrow", text: "GALERIE KLIENTÓW" }), el("h2", { text: "Strefa klienta" }), el("p", { text: "Ustawienia wspólne dla wszystkich galerii." })),
        el("button", { type: "button", class: "ghost", text: "×", onclick: () => dialog.close() })),
      el("label", {}, "Link do wystawienia opinii Google", fields.googleReviewUrl,
        el("p", { class: "rx-hint", text: "Klient zobaczy prośbę o opinię raz — po zatwierdzeniu wyboru albo pobraniu zdjęć. Link znajdziesz w Profilu Firmy Google → „Poproś o opinie”. Zostaw puste, żeby wyłączyć." })),
      el("label", {}, "E-mail kontaktowy (stopka galerii)", fields.contactEmail),
      el("label", {}, "Instagram (stopka galerii)", fields.contactInstagram),
      el("label", {}, "Tekst praw autorskich", fields.copyrightText),
      msg,
      el("div", { class: "rx-actions" },
        el("button", { type: "button", class: "ghost", text: "Otwórz Strefę klienta", onclick: () => window.open(new URL("home.html", location.href), "_blank", "noopener") }),
        el("button", { type: "button", class: "primary", text: "Zapisz", onclick: async event => {
          const button = event.currentTarget;
          button.disabled = true;
          try {
            const data = {
              googleReviewUrl: httpsOrEmpty(fields.googleReviewUrl.value),
              contactEmail: fields.contactEmail.value.trim(),
              contactInstagram: httpsOrEmpty(fields.contactInstagram.value),
              copyrightText: fields.copyrightText.value.trim(),
              updatedAt: Date.now()
            };
            await update(ref(db, ZONE_CONFIG_PATH), data);
            status(msg, "Zapisano. Zmiany widać od razu w galeriach klientów.", "ok");
          } catch (error) {
            status(msg, `Nie zapisano: ${error.message || error}`, "err");
          } finally {
            button.disabled = false;
          }
        } })))
  );
  document.body.appendChild(dialog);
  dialog.fill = data => Object.entries(fields).forEach(([key, input]) => { input.value = data?.[key] || ""; });
  dialog.msg = msg;
  return dialog;
}

async function openSettings() {
  const dialog = $("#rxSettingsDialog") || buildSettingsDialog();
  status(dialog.msg, "");
  try {
    const snap = await get(ref(db, ZONE_CONFIG_PATH));
    dialog.fill(snap.val() || {});
  } catch (error) {
    status(dialog.msg, `Nie udało się wczytać ustawień: ${error.message || error}`, "err");
  }
  dialog.showModal();
}

// ------------------------------------------------------------ filmy w galerii

function currentSlug() {
  return String($("#editingSlug")?.value || "").trim();
}

function buildVideosDialog() {
  const list = el("div", { class: "rx-list" });
  const title = el("input", { type: "text", placeholder: "np. Film ze ślubu" });
  const link = el("input", { type: "url", placeholder: "https://youtu.be/... albo https://vimeo.com/..." });
  const fileTitle = el("input", { type: "text", placeholder: "Tytuł filmu" });
  const file = el("input", { type: "file", accept: "video/mp4,video/webm,video/quicktime" });
  const bar = el("div", { class: "rx-bar", hidden: true }, el("i"));
  const msg = el("div", { class: "rx-status", hidden: true });
  const heading = el("h2", { text: "Filmy w galerii" });

  const dialog = el("dialog", { id: "rxVideosDialog", class: "rx-dialog" },
    el("div", { class: "rx-in" },
      el("div", { class: "rx-head" },
        el("div", {}, el("p", { class: "eyebrow", text: "GALERIA" }), heading, el("p", { text: "Filmy pojawiają się nad zdjęciami i w zakładce „Filmy”." })),
        el("button", { type: "button", class: "ghost", text: "×", onclick: () => dialog.close() })),
      list,
      el("p", { class: "eyebrow", text: "DODAJ LINK (YOUTUBE / VIMEO)" }),
      el("p", { class: "rx-hint", text: "Najlepsza opcja dla dłuższych filmów: wgraj film na YouTube jako „Niepubliczny” i wklej link. Nie zajmuje miejsca w Firebase." }),
      el("div", { class: "rx-row" },
        el("label", {}, "Tytuł", title),
        el("label", {}, "Link", link),
        el("button", { type: "button", class: "primary", text: "Dodaj", onclick: async () => {
          try {
            const url = httpsOrEmpty(link.value);
            if (!/youtu\.?be|vimeo\.com/.test(url)) throw new Error("Wklej link do YouTube albo Vimeo.");
            await addVideo({ title: title.value.trim() || "Film", url });
            title.value = ""; link.value = "";
            status(msg, "Dodano film.", "ok");
          } catch (error) {
            status(msg, error.message || String(error), "err");
          }
        } })),
      el("p", { class: "eyebrow", text: "ALBO WGRAJ PLIK WIDEO" }),
      el("p", { class: "rx-hint", text: "MP4 (H.264) działa na wszystkich telefonach. Duże pliki zajmują miejsce i transfer w Firebase Storage." }),
      el("div", { class: "rx-row" },
        el("label", {}, "Tytuł", fileTitle),
        el("label", {}, "Plik", file),
        el("button", { type: "button", class: "primary", text: "Wgraj", onclick: async event => {
          const button = event.currentTarget;
          const chosen = file.files?.[0];
          if (!chosen) return status(msg, "Wybierz plik wideo.", "err");
          button.disabled = true;
          bar.hidden = false;
          try {
            const slug = currentSlug();
            const safe = chosen.name.replace(/[^\w.\-]+/g, "_");
            const path = `galleries/${slug}/videos/${Date.now()}-${safe}`;
            await new Promise((resolve, reject) => {
              const task = uploadBytesResumable(sRef(storage, path), chosen, {
                contentType: chosen.type || "video/mp4",
                cacheControl: "private,max-age=86400"
              });
              task.on("state_changed",
                snap => { bar.firstElementChild.style.width = `${Math.round((snap.bytesTransferred / snap.totalBytes) * 100)}%`; },
                reject, resolve);
            });
            await addVideo({ title: fileTitle.value.trim() || chosen.name.replace(/\.[^.]+$/, ""), path });
            fileTitle.value = ""; file.value = "";
            status(msg, "Wgrano film.", "ok");
          } catch (error) {
            status(msg, `Nie udało się wgrać: ${error.code || error.message || error}`, "err");
          } finally {
            button.disabled = false;
            setTimeout(() => { bar.hidden = true; bar.firstElementChild.style.width = "0"; }, 800);
          }
        } })),
      bar,
      msg)
  );
  document.body.appendChild(dialog);

  dialog.refresh = async () => {
    const slug = currentSlug();
    const snap = await get(ref(db, `galleries/${slug}/public/videos`));
    const items = Object.entries(snap.val() || {}).sort((a, b) => Number(a[1]?.addedAt || 0) - Number(b[1]?.addedAt || 0));
    list.replaceChildren(...(items.length ? items.map(([key, item]) => el("div", { class: "rx-item" },
      el("div", {}, el("strong", { text: item.title || "Film" }), el("small", { text: item.url || item.path || "" })),
      el("button", { type: "button", class: "danger", text: "Usuń", onclick: async () => {
        if (!confirm(`Usunąć film „${item.title || "Film"}” z galerii?`)) return;
        try {
          if (item.path) await deleteObject(sRef(storage, item.path)).catch(() => {});
          await remove(ref(db, `galleries/${slug}/public/videos/${key}`));
          await dialog.refresh();
        } catch (error) {
          status(msg, `Nie udało się usunąć: ${error.message || error}`, "err");
        }
      } })
    )) : [el("p", { class: "rx-hint", text: "Ta galeria nie ma jeszcze filmów." })]));
  };

  async function addVideo(data) {
    const slug = currentSlug();
    if (!slug) throw new Error("Najpierw zapisz galerię.");
    await set(push(ref(db, `galleries/${slug}/public/videos`)), { ...data, addedAt: Date.now() });
    await update(ref(db, `galleries/${slug}/public`), { updatedAt: Date.now() });
    await dialog.refresh();
  }

  dialog.heading = heading;
  dialog.msg = msg;
  return dialog;
}

async function openVideos() {
  const slug = currentSlug();
  if (!slug) return alert("Najpierw zapisz galerię, potem dodaj filmy.");
  const dialog = $("#rxVideosDialog") || buildVideosDialog();
  dialog.heading.textContent = `Filmy — ${$("#galleryTitleInput")?.value || slug}`;
  status(dialog.msg, "");
  await dialog.refresh().catch(error => status(dialog.msg, `Nie udało się wczytać filmów: ${error.message || error}`, "err"));
  dialog.showModal();
}

// ------------------------------------------------------------ start

function injectButtons() {
  const head = $(".admin-head-actions");
  if (head && !$("#rxSettingsBtn")) {
    const button = el("button", { id: "rxSettingsBtn", type: "button", class: "ghost", text: "⭐ Strefa klienta", onclick: openSettings });
    head.insertBefore(button, $("#healthPanelBtn") || head.firstChild);
  }
  const actions = $("#galleryDialog .actions");
  if (actions && !$("#rxVideosBtn")) {
    const button = el("button", { id: "rxVideosBtn", type: "button", class: "ghost", text: "🎬 Filmy", onclick: openVideos });
    actions.insertBefore(button, $(".spacer", actions));
  }
}

async function start() {
  for (let i = 0; i < 160 && !getApps().length; i++) await new Promise(resolve => setTimeout(resolve, 25));
  if (!getApps().length) return;
  const app = getApp();
  auth = getAuth(app);
  db = getDatabase(app);
  storage = getStorage(app);
  onAuthStateChanged(auth, user => {
    if (user?.uid !== ADMIN_UID) return;
    injectStyles();
    injectButtons();
  });
}

start();
