import { getApps, getApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getDatabase, ref, get, update, remove, onValue } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";
import { getStorage, ref as sRef, listAll, deleteObject } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js";
import { ADMIN_UID } from "./firebase-config.js?v=17.0";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const TRASH_DAYS = 7;
const TRASH_MS = TRASH_DAYS * 24 * 60 * 60 * 1000;

let app;
let auth;
let db;
let storage;
let allGalleries = {};
let orderDraft = [];
let currentShareSlug = null;
let shareBlob = null;
let initialized = false;
const deletingSlugs = new Set();

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;"
  }[c]));
}

function displayName(filename) {
  return String(filename || "").replace(/\.(jpe?g|png|webp)$/i, "");
}

function galleryUrl(slug) {
  const url = new URL("./", location.href);
  url.pathname = url.pathname.replace(/\/admin(?:\.html)?\/?$/i, "/");
  url.search = "";
  url.hash = "";
  url.searchParams.set("g", slug);
  return url.toString();
}

function toast(message) {
  const existing = $("#premiumV17Toast");
  if (existing) existing.remove();
  const el = document.createElement("div");
  el.id = "premiumV17Toast";
  el.textContent = message;
  el.style.cssText = "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:99999;background:#f4f4f1;color:#111;padding:11px 14px;border-radius:12px;font:700 12px system-ui;box-shadow:0 10px 40px #0008;max-width:min(90vw,520px);text-align:center";
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3400);
}

async function waitForApp() {
  for (let i = 0; i < 120; i++) {
    if (getApps().length) return getApp();
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error("Firebase app nie został uruchomiony.");
}

function injectStyles() {
  if ($("#premiumV17Styles")) return;
  const style = document.createElement("style");
  style.id = "premiumV17Styles";
  style.textContent = `
    .premium17-card-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:8px;padding-top:8px;border-top:1px solid #29292f}
    .premium17-card-actions button{font-size:10px;padding:8px 10px}
    .premium17-home-hidden{opacity:.82}
    .premium17-home-hidden .gallery-cover::after{content:"UKRYTA NA HOME";position:absolute;inset:auto 12px 12px auto;padding:6px 8px;border-radius:999px;background:#000c;border:1px solid #ffffff2c;color:#fff;font:800 9px system-ui;letter-spacing:.06em;z-index:4}
    #premiumTrashDialog,#premiumOrderDialog,#premiumShareDialog{width:min(920px,calc(100% - 18px));max-height:90vh;padding:0;border:1px solid #34343a;border-radius:20px;background:#111113;color:#f4f4f2}
    #premiumTrashDialog::backdrop,#premiumOrderDialog::backdrop,#premiumShareDialog::backdrop{background:#000c;backdrop-filter:blur(7px)}
    .premium17-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:20px;border-bottom:1px solid #29292f}
    .premium17-head h2{margin:3px 0 5px;font-size:28px}.premium17-head p{margin:0;color:#8e8e95;font-size:12px}.premium17-close{width:39px;height:39px;border:1px solid #34343a;border-radius:11px;background:#17171a;color:#fff;font-size:21px;cursor:pointer}
    .premium17-body{padding:16px 20px 20px}.premium17-list{display:grid;gap:9px}.premium17-empty{padding:24px;border:1px dashed #34343a;border-radius:14px;color:#888;text-align:center}
    .trash-row,.order-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;padding:12px;border:1px solid #2d2d32;border-radius:13px;background:#151518}
    .trash-row strong,.order-row strong{display:block;font-size:13px}.trash-row small,.order-row small{display:block;color:#83838b;margin-top:4px;font-size:10px}.trash-actions,.order-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
    .premium17-danger{background:#30191d!important;border-color:#67323a!important;color:#ffadb5!important}
    .premium17-order-num{display:inline-grid;place-items:center;width:25px;height:25px;border:1px solid #3a3a40;border-radius:8px;margin-right:8px;color:#aaa}
    .premium17-footer{display:flex;gap:8px;align-items:center;padding:14px 20px;border-top:1px solid #29292f}.premium17-footer .spacer{flex:1}
    .premium17-share-layout{display:grid;grid-template-columns:minmax(0,1fr) 260px;gap:16px;align-items:start}.premium17-canvas-wrap{background:#09090a;border:1px solid #2d2d33;border-radius:14px;padding:10px}.premium17-canvas-wrap canvas{display:block;width:100%;height:auto;border-radius:10px;background:#111}.premium17-share-side{display:grid;gap:10px}.premium17-share-side .ghost,.premium17-share-side .primary{width:100%}.premium17-share-note{padding:11px;border:1px solid #2c2c31;border-radius:11px;background:#151518;color:#8f8f96;font-size:10px;line-height:1.45}
    @media(max-width:700px){.premium17-share-layout{grid-template-columns:1fr}.trash-row,.order-row{grid-template-columns:1fr}.trash-actions,.order-actions{justify-content:flex-start}.premium17-head h2{font-size:23px}}
  `;
  document.head.appendChild(style);
}

function injectHeaderButtons() {
  const actions = $(".admin-head-actions");
  if (!actions) return;

  if (!$("#premiumOrderBtn")) {
    const btn = document.createElement("button");
    btn.id = "premiumOrderBtn";
    btn.type = "button";
    btn.className = "ghost";
    btn.textContent = "↕ Kolejność home";
    actions.insertBefore(btn, $("#newGalleryBtn") || null);
    btn.addEventListener("click", openOrderDialog);
  }

  if (!$("#premiumTrashBtn")) {
    const btn = document.createElement("button");
    btn.id = "premiumTrashBtn";
    btn.type = "button";
    btn.className = "ghost";
    btn.textContent = "🗑 Kosz";
    actions.insertBefore(btn, $("#newGalleryBtn") || null);
    btn.addEventListener("click", openTrashDialog);
  }
}

function injectDialogs() {
  if (!$("#premiumTrashDialog")) {
    document.body.insertAdjacentHTML("beforeend", `
      <dialog id="premiumTrashDialog">
        <div class="premium17-head"><div><small class="eyebrow">BEZPIECZNE USUWANIE</small><h2>Kosz galerii</h2><p>Usunięte galerie pozostają tutaj przez ${TRASH_DAYS} dni. Możesz je przywrócić albo usunąć od razu na stałe.</p></div><button class="premium17-close" data-close-premium="premiumTrashDialog">×</button></div>
        <div class="premium17-body"><div id="premiumTrashList" class="premium17-list"></div></div>
        <div class="premium17-footer"><span id="premiumTrashInfo" class="muted"></span><span class="spacer"></span><button type="button" class="ghost" data-close-premium="premiumTrashDialog">Zamknij</button></div>
      </dialog>`);
  }

  if (!$("#premiumOrderDialog")) {
    document.body.insertAdjacentHTML("beforeend", `
      <dialog id="premiumOrderDialog">
        <div class="premium17-head"><div><small class="eyebrow">STREFA KLIENTA</small><h2>Kolejność galerii na home</h2><p>Ustaw, które galerie klient zobaczy jako pierwsze. Galerie ukryte na home są pomijane.</p></div><button class="premium17-close" data-close-premium="premiumOrderDialog">×</button></div>
        <div class="premium17-body"><div id="premiumOrderList" class="premium17-list"></div></div>
        <div class="premium17-footer"><button id="premiumOrderAlphabetical" type="button" class="ghost">A–Z</button><span class="spacer"></span><button type="button" class="ghost" data-close-premium="premiumOrderDialog">Anuluj</button><button id="premiumOrderSave" type="button" class="primary">Zapisz kolejność</button></div>
      </dialog>`);
  }

  if (!$("#premiumShareDialog")) {
    document.body.insertAdjacentHTML("beforeend", `
      <dialog id="premiumShareDialog">
        <div class="premium17-head"><div><small class="eyebrow">MESSENGER / WHATSAPP</small><h2>Karta udostępniania</h2><p>Anonimowa karta 1200×630 z rozmytą okładką, nazwą sesji i logo RAF.studio.</p></div><button class="premium17-close" data-close-premium="premiumShareDialog">×</button></div>
        <div class="premium17-body"><div class="premium17-share-layout"><div class="premium17-canvas-wrap"><canvas id="premiumShareCanvas" width="1200" height="630"></canvas></div><div class="premium17-share-side"><button id="premiumShareNative" class="primary" type="button">↗ Udostępnij kartę + link</button><button id="premiumShareDownload" class="ghost" type="button">↓ Pobierz PNG</button><button id="premiumShareCopyLink" class="ghost" type="button">Kopiuj sam link</button><div class="premium17-share-note">Na GitHub Pages link ma parametr <b>?g=...</b>. Messenger i WhatsApp nie uruchamiają JavaScriptu przy budowaniu dynamicznego podglądu OG, dlatego ta funkcja udostępnia gotową kartę graficzną razem z linkiem — bez dodatkowej usługi i bez ujawniania ostrego zdjęcia.</div></div></div></div>
      </dialog>`);
  }

  $$('[data-close-premium]').forEach(btn => {
    if (btn.dataset.boundPremium) return;
    btn.dataset.boundPremium = "1";
    btn.addEventListener("click", () => $("#" + btn.dataset.closePremium)?.close());
  });

  $("#premiumOrderSave")?.addEventListener("click", saveOrder);
  $("#premiumOrderAlphabetical")?.addEventListener("click", () => {
    orderDraft.sort((a,b) => a.title.localeCompare(b.title, "pl", {numeric:true,sensitivity:"base"}));
    renderOrderRows();
  });
  $("#premiumShareNative")?.addEventListener("click", shareCardNative);
  $("#premiumShareDownload")?.addEventListener("click", downloadShareCard);
  $("#premiumShareCopyLink")?.addEventListener("click", async () => {
    if (!currentShareSlug) return;
    await navigator.clipboard.writeText(galleryUrl(currentShareSlug));
    toast("Link do galerii skopiowany");
  });
}

function replaceDeleteButton() {
  const old = $("#deleteGalleryBtn");
  if (!old || old.dataset.premiumTrash === "1") return;
  const fresh = old.cloneNode(true);
  fresh.dataset.premiumTrash = "1";
  fresh.textContent = "Przenieś do kosza";
  old.replaceWith(fresh);
  fresh.addEventListener("click", softDeleteCurrentGallery);
}

async function softDeleteCurrentGallery() {
  const slug = $("#editingSlug")?.value?.trim();
  if (!slug) return;
  const pub = allGalleries?.[slug]?.public || {};
  if (!confirm(`Przenieść galerię „${pub.title || slug}” do kosza na ${TRASH_DAYS} dni?\n\nZdjęcia NIE zostaną teraz usunięte.`)) return;

  const now = Date.now();
  try {
    await update(ref(db, `galleries/${slug}/public`), {
      trashedAt: now,
      trashExpiresAt: now + TRASH_MS,
      trashPreviousActive: pub.active !== false,
      trashPreviousEnabled: pub.enabled !== false,
      trashPreviousHomeHidden: pub.homeHidden === true,
      active: false,
      enabled: false,
      homeHidden: true,
      updatedAt: now
    });
    $("#galleryDialog")?.close();
    toast(`Galeria przeniesiona do kosza na ${TRASH_DAYS} dni`);
  } catch (error) {
    console.error("PREMIUM TRASH ERROR", error);
    toast(`Nie udało się przenieść do kosza: ${error.message || error}`);
  }
}

function trashedEntries() {
  return Object.entries(allGalleries || {})
    .filter(([slug,g]) => !slug.startsWith("__system__") && Number(g?.public?.trashedAt || 0) > 0)
    .sort((a,b) => Number(b[1]?.public?.trashedAt || 0) - Number(a[1]?.public?.trashedAt || 0));
}

function renderTrash() {
  const list = $("#premiumTrashList");
  if (!list) return;
  const rows = trashedEntries();
  $("#premiumTrashInfo").textContent = `${rows.length} ${rows.length === 1 ? "galeria" : "galerii"} w koszu`;
  if (!rows.length) {
    list.innerHTML = `<div class="premium17-empty">Kosz jest pusty.</div>`;
    return;
  }

  list.innerHTML = rows.map(([slug,g]) => {
    const pub = g.public || {};
    const expires = Number(pub.trashExpiresAt || (Number(pub.trashedAt || 0) + TRASH_MS));
    const remainingMs = expires - Date.now();
    const days = Math.max(0, Math.ceil(remainingMs / 86400000));
    return `<div class="trash-row"><div><strong>${escapeHtml(pub.title || slug)}</strong><small>${remainingMs > 0 ? `Automatyczne czyszczenie za ok. ${days} dni` : "Okres 7 dni minął — galeria czeka na trwałe usunięcie"}</small></div><div class="trash-actions"><button class="ghost" data-trash-restore="${escapeHtml(slug)}">↶ Przywróć</button><button class="ghost premium17-danger" data-trash-delete="${escapeHtml(slug)}">Usuń na stałe</button></div></div>`;
  }).join("");

  $$('[data-trash-restore]', list).forEach(btn => btn.addEventListener("click", () => restoreGallery(btn.dataset.trashRestore)));
  $$('[data-trash-delete]', list).forEach(btn => btn.addEventListener("click", () => permanentDelete(btn.dataset.trashDelete, true)));
}

function openTrashDialog() {
  renderTrash();
  $("#premiumTrashDialog")?.showModal();
}

async function restoreGallery(slug) {
  const pub = allGalleries?.[slug]?.public || {};
  try {
    await update(ref(db, `galleries/${slug}/public`), {
      trashedAt: null,
      trashExpiresAt: null,
      active: pub.trashPreviousActive !== false,
      enabled: pub.trashPreviousEnabled !== false,
      homeHidden: pub.trashPreviousHomeHidden === true,
      trashPreviousActive: null,
      trashPreviousEnabled: null,
      trashPreviousHomeHidden: null,
      updatedAt: Date.now()
    });
    toast("Galeria przywrócona");
    setTimeout(renderTrash, 100);
  } catch (error) {
    console.error("RESTORE GALLERY ERROR", error);
    toast(`Nie udało się przywrócić: ${error.message || error}`);
  }
}

async function deleteStorageTree(path) {
  const root = sRef(storage, path);
  const result = await listAll(root);
  await Promise.all(result.items.map(item => deleteObject(item).catch(() => {})));
  for (const prefix of result.prefixes) {
    await deleteStorageTree(prefix.fullPath);
  }
}

async function permanentDelete(slug, ask = true) {
  if (deletingSlugs.has(slug)) return;
  const title = allGalleries?.[slug]?.public?.title || slug;
  if (ask && !confirm(`Usunąć „${title}” NA STAŁE?\n\nZnikną oryginały, preview, wybory i historia. Tej operacji nie można cofnąć.`)) return;
  deletingSlugs.add(slug);
  try {
    await deleteStorageTree(`galleries/${slug}`).catch(() => {});
    await Promise.all([
      remove(ref(db, `favorites/${slug}`)).catch(() => {}),
      remove(ref(db, `selections/${slug}`)).catch(() => {}),
      remove(ref(db, `approvals/${slug}`)).catch(() => {})
    ]);
    await remove(ref(db, `galleries/${slug}`));
    toast("Galeria usunięta na stałe");
    setTimeout(renderTrash, 100);
  } catch (error) {
    console.error("PERMANENT DELETE ERROR", error);
    toast(`Błąd trwałego usuwania: ${error.message || error}`);
  } finally {
    deletingSlugs.delete(slug);
  }
}

async function cleanupExpiredTrash() {
  const now = Date.now();
  const expired = trashedEntries().filter(([,g]) => Number(g?.public?.trashExpiresAt || 0) > 0 && Number(g.public.trashExpiresAt) <= now);
  for (const [slug] of expired) {
    await permanentDelete(slug, false);
  }
}

function visibleHomeEntries() {
  return Object.entries(allGalleries || {})
    .filter(([slug,g]) => !slug.startsWith("__system__") && g?.public && !g.public.trashedAt && g.public.homeHidden !== true)
    .map(([slug,g]) => ({slug, title:String(g.public.title || slug), order:Number.isFinite(Number(g.public.homeOrder)) ? Number(g.public.homeOrder) : 999999, createdAt:Number(g.public.createdAt || 0)}))
    .sort((a,b) => a.order - b.order || b.createdAt - a.createdAt || a.title.localeCompare(b.title,"pl",{numeric:true,sensitivity:"base"}));
}

function openOrderDialog() {
  orderDraft = visibleHomeEntries().map(item => ({...item}));
  renderOrderRows();
  $("#premiumOrderDialog")?.showModal();
}

function renderOrderRows() {
  const list = $("#premiumOrderList");
  if (!list) return;
  if (!orderDraft.length) {
    list.innerHTML = `<div class="premium17-empty">Brak galerii widocznych na stronie głównej.</div>`;
    return;
  }
  list.innerHTML = orderDraft.map((item,index) => `<div class="order-row"><div><strong><span class="premium17-order-num">${index+1}</span>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.slug)}</small></div><div class="order-actions"><button type="button" class="ghost" data-order-up="${index}" ${index===0?"disabled":""}>↑</button><button type="button" class="ghost" data-order-down="${index}" ${index===orderDraft.length-1?"disabled":""}>↓</button></div></div>`).join("");
  $$('[data-order-up]', list).forEach(btn => btn.addEventListener("click", () => moveOrder(Number(btn.dataset.orderUp), -1)));
  $$('[data-order-down]', list).forEach(btn => btn.addEventListener("click", () => moveOrder(Number(btn.dataset.orderDown), 1)));
}

function moveOrder(index, delta) {
  const next = index + delta;
  if (next < 0 || next >= orderDraft.length) return;
  [orderDraft[index], orderDraft[next]] = [orderDraft[next], orderDraft[index]];
  renderOrderRows();
}

async function saveOrder() {
  const patch = {};
  orderDraft.forEach((item,index) => {
    patch[`galleries/${item.slug}/public/homeOrder`] = (index + 1) * 10;
    patch[`galleries/${item.slug}/public/updatedAt`] = Date.now();
  });
  try {
    await update(ref(db), patch);
    $("#premiumOrderDialog")?.close();
    toast("Kolejność galerii na home zapisana");
  } catch (error) {
    console.error("SAVE HOME ORDER ERROR", error);
    toast(`Nie udało się zapisać kolejności: ${error.message || error}`);
  }
}

async function toggleHomeVisibility(slug) {
  const pub = allGalleries?.[slug]?.public || {};
  const next = pub.homeHidden !== true;
  try {
    await update(ref(db, `galleries/${slug}/public`), {
      homeHidden: next,
      updatedAt: Date.now()
    });
    toast(next ? "Galeria ukryta na głównej Strefie klienta" : "Galeria znów widoczna na home");
  } catch (error) {
    toast(`Błąd zmiany widoczności: ${error.message || error}`);
  }
}

function decorateCards() {
  const list = $("#galleryList");
  if (!list) return;

  $$(".gallery-card", list).forEach(card => {
    const slug = $("[data-upload]", card)?.dataset.upload || $("[data-copy]", card)?.dataset.copy;
    if (!slug) return;
    const pub = allGalleries?.[slug]?.public || {};
    card.hidden = Boolean(pub.trashedAt);
    card.classList.toggle("premium17-home-hidden", pub.homeHidden === true);
    if (pub.trashedAt) return;

    let actions = $(".premium17-card-actions", card);
    if (!actions) {
      actions = document.createElement("div");
      actions.className = "premium17-card-actions";
      const body = $(".gallery-body", card) || card;
      body.appendChild(actions);
    }

    actions.innerHTML = `
      <button type="button" class="ghost" data-premium-home="${escapeHtml(slug)}">${pub.homeHidden === true ? "👁 Pokaż na home" : "🙈 Ukryj na home"}</button>
      <button type="button" class="ghost" data-premium-share="${escapeHtml(slug)}">🔗 Karta linku</button>`;

    $("[data-premium-home]", actions)?.addEventListener("click", () => toggleHomeVisibility(slug));
    $("[data-premium-share]", actions)?.addEventListener("click", () => openShareCard(slug));
  });

  const visible = Object.entries(allGalleries || {}).filter(([slug,g]) => !slug.startsWith("__system__") && g?.public && !g.public.trashedAt);
  const stat = $("#statGalleries");
  if (stat) stat.textContent = visible.length;
}

function getCoverPreview(slug) {
  const pub = allGalleries?.[slug]?.public || {};
  const photos = Object.values(pub.photos || {}).filter(Boolean);
  const cover = photos.find(photo => photo?.filename === pub.coverFile) || photos[0] || null;
  return cover?.previewUrl || "";
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function drawCover(ctx, img, x, y, w, h) {
  const scale = Math.max(w / img.width, h / img.height);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (img.width - sw) / 2;
  const sy = (img.height - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

async function buildShareCard(slug) {
  const canvas = $("#premiumShareCanvas");
  const ctx = canvas.getContext("2d");
  const pub = allGalleries?.[slug]?.public || {};
  const title = String(pub.title || slug);
  const coverUrl = getCoverPreview(slug);

  ctx.clearRect(0,0,1200,630);
  ctx.fillStyle = "#0b0b0d";
  ctx.fillRect(0,0,1200,630);

  if (coverUrl) {
    try {
      const cover = await loadImage(coverUrl);
      ctx.save();
      ctx.filter = "blur(24px) brightness(0.48) saturate(0.85)";
      drawCover(ctx, cover, -35, -35, 1270, 700);
      ctx.restore();
    } catch (error) {
      console.warn("Share cover canvas fallback", error);
    }
  }

  const grad = ctx.createLinearGradient(0,0,1200,630);
  grad.addColorStop(0,"rgba(5,5,7,.20)");
  grad.addColorStop(.52,"rgba(5,5,7,.34)");
  grad.addColorStop(1,"rgba(5,5,7,.80)");
  ctx.fillStyle = grad;
  ctx.fillRect(0,0,1200,630);

  try {
    const logo = await loadImage("./logo-white.png");
    const targetW = 250;
    const targetH = logo.height * (targetW / logo.width);
    ctx.drawImage(logo, 72, 64, targetW, targetH);
  } catch {}

  ctx.fillStyle = "rgba(255,255,255,.72)";
  ctx.font = "700 20px Arial, sans-serif";
  ctx.fillText("PRYWATNA GALERIA KLIENTA", 76, 405);

  ctx.fillStyle = "#fff";
  let fontSize = 64;
  ctx.font = `800 ${fontSize}px Arial, sans-serif`;
  while (ctx.measureText(title).width > 1040 && fontSize > 38) {
    fontSize -= 2;
    ctx.font = `800 ${fontSize}px Arial, sans-serif`;
  }
  ctx.fillText(title, 72, 480);

  ctx.fillStyle = "rgba(255,255,255,.72)";
  ctx.font = "400 24px Arial, sans-serif";
  ctx.fillText("Dostęp do galerii chroniony hasłem • RAF.studio", 74, 530);

  shareBlob = await new Promise(resolve => canvas.toBlob(resolve, "image/png", 0.95));
  return shareBlob;
}

async function openShareCard(slug) {
  currentShareSlug = slug;
  shareBlob = null;
  $("#premiumShareDialog")?.showModal();
  const ctx = $("#premiumShareCanvas")?.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#0b0b0d"; ctx.fillRect(0,0,1200,630);
    ctx.fillStyle = "#aaa"; ctx.font = "700 30px Arial"; ctx.fillText("Tworzę kartę…", 70, 330);
  }
  try {
    await buildShareCard(slug);
  } catch (error) {
    console.error("BUILD SHARE CARD ERROR", error);
    toast("Nie udało się utworzyć karty linku");
  }
}

async function shareCardNative() {
  if (!currentShareSlug) return;
  if (!shareBlob) await buildShareCard(currentShareSlug);
  const pub = allGalleries?.[currentShareSlug]?.public || {};
  const title = String(pub.title || currentShareSlug);
  const link = galleryUrl(currentShareSlug);
  const file = new File([shareBlob], `RAF-studio-${displayName(title).replace(/[^a-z0-9-_]+/gi,"-")}.png`, {type:"image/png"});

  try {
    if (navigator.share && (!navigator.canShare || navigator.canShare({files:[file]}))) {
      await navigator.share({
        title: `RAF.studio — ${title}`,
        text: `Twoja prywatna galeria RAF.studio — ${title}\n${link}`,
        files: [file]
      });
      return;
    }
  } catch (error) {
    if (error?.name === "AbortError") return;
    console.warn("Native share failed", error);
  }

  await navigator.clipboard.writeText(link).catch(() => {});
  downloadShareCard();
  toast("Przeglądarka nie obsługuje udostępniania pliku — pobrałem kartę PNG i skopiowałem link");
}

function downloadShareCard() {
  if (!shareBlob || !currentShareSlug) return;
  const title = String(allGalleries?.[currentShareSlug]?.public?.title || currentShareSlug);
  const url = URL.createObjectURL(shareBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `RAF-studio-${displayName(title).replace(/[^a-z0-9-_]+/gi,"-")}-karta.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

function observeCards() {
  const list = $("#galleryList");
  if (!list) return;
  const observer = new MutationObserver(() => setTimeout(decorateCards, 0));
  observer.observe(list, {childList:true, subtree:true});
}

async function initialize() {
  if (initialized) return;
  initialized = true;
  injectStyles();
  injectHeaderButtons();
  injectDialogs();
  replaceDeleteButton();
  observeCards();

  app = await waitForApp();
  auth = getAuth(app);
  db = getDatabase(app);
  storage = getStorage(app);

  onAuthStateChanged(auth, user => {
    if (!user || user.uid !== ADMIN_UID) return;
    onValue(ref(db, "galleries"), snap => {
      allGalleries = snap.val() || {};
      replaceDeleteButton();
      setTimeout(decorateCards, 0);
      if ($("#premiumTrashDialog")?.open) renderTrash();
      if ($("#premiumOrderDialog")?.open) {
        const live = new Map(visibleHomeEntries().map(item => [item.slug,item]));
        orderDraft = orderDraft.filter(item => live.has(item.slug)).map(item => ({...item,...live.get(item.slug)}));
        renderOrderRows();
      }
      cleanupExpiredTrash().catch(error => console.warn("Expired trash cleanup", error));
    });
  });
}

initialize().catch(error => console.error("RAF PREMIUM V17 INIT ERROR", error));
