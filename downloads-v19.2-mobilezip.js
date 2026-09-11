import { getApps, getApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getDatabase, ref, get, onValue } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";
import { getStorage, ref as sRef, getBlob } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js";

const slug = new URLSearchParams(location.search).get("g") || "";
const encoder = new TextEncoder();
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

let gallery = null;
let photos = [];
let favorites = new Set();
let storage = null;
let db = null;
let busy = false;
let unsubscribe = null;
const buttons = {};

window.RAF_ZIP_READY = false;

function toast(text, ms = 4500) {
  const el = $("#toast");
  if (!el) return;
  el.textContent = text;
  el.hidden = false;
  clearTimeout(el._rafZipTimer);
  el._rafZipTimer = setTimeout(() => { el.hidden = true; }, ms);
}

function safeName(value, fallback = "RAF-studio-galeria") {
  return (String(value || "").normalize("NFKD")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ").replace(/[. ]+$/g, "").trim()) || fallback;
}

function noExt(value) {
  return String(value || "").replace(/\.(jpe?g|png|webp)$/i, "");
}

function masterEnabled() { return gallery?.downloadsEnabled !== false; }
function favEnabled() { return masterEnabled() && gallery?.uiConfig?.allowFavoriteDownloads !== false; }
function selectedEnabled() { return masterEnabled() && gallery?.uiConfig?.allowSelectedDownloads !== false; }

function injectProgress() {
  if ($("#rafZipProgressV192")) return;
  const style = document.createElement("style");
  style.textContent = `#rafZipProgressV192{position:fixed;z-index:2147483646;left:50%;bottom:max(18px,env(safe-area-inset-bottom));transform:translateX(-50%);width:min(520px,calc(100% - 24px));padding:14px;border:1px solid #34343a;border-radius:16px;background:#101012f2;color:#fff;box-shadow:0 18px 70px #000b;backdrop-filter:blur(16px);font-family:system-ui,-apple-system,sans-serif}#rafZipProgressV192[hidden]{display:none!important}.rz-h{display:flex;align-items:center;gap:10px}.rz-h strong{font-size:13px}.rz-h span{margin-left:auto;color:#aaa;font-size:11px}.rz-t{height:7px;background:#29292d;border-radius:999px;overflow:hidden;margin-top:10px}.rz-b{height:100%;width:0;background:#f5f5f2;transition:width .12s linear}.rz-f{font-size:10px;color:#aaa;margin-top:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}`;
  document.head.appendChild(style);
  document.body.insertAdjacentHTML("beforeend", `<div id="rafZipProgressV192" hidden><div class="rz-h"><strong>Przygotowuję ZIP…</strong><span>0%</span></div><div class="rz-t"><div class="rz-b"></div></div><div class="rz-f">Start…</div></div>`);
}

function progress(percent, file, title = "Przygotowuję ZIP…") {
  injectProgress();
  const box = $("#rafZipProgressV192");
  const p = Math.max(0, Math.min(100, Math.round(percent)));
  box.hidden = false;
  $(".rz-h strong", box).textContent = title;
  $(".rz-h span", box).textContent = `${p}%`;
  $(".rz-b", box).style.width = `${p}%`;
  $(".rz-f", box).textContent = file || "";
}
function hideProgress(delay = 1000) { setTimeout(() => { const b = $("#rafZipProgressV192"); if (b) b.hidden = true; }, delay); }

function write16(v, o, n) { v.setUint16(o, n & 0xffff, true); }
function write32(v, o, n) { v.setUint32(o, n >>> 0, true); }
let crcTable;
function table() {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    crcTable[n] = c >>> 0;
  }
  return crcTable;
}
async function crc32(blob) {
  const arr = new Uint8Array(await blob.arrayBuffer());
  const t = table(); let crc = 0xffffffff;
  for (let i = 0; i < arr.length; i++) crc = t[(crc ^ arr[i]) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function stamp() {
  const d = new Date(), y = Math.max(1980, d.getFullYear());
  return { time: ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) | ((d.getSeconds() >> 1) & 31), date: (((y - 1980) & 127) << 9) | (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31) };
}
function localHeader(e) {
  const b = new Uint8Array(30), v = new DataView(b.buffer);
  write32(v,0,0x04034b50); write16(v,4,20); write16(v,6,0x0800); write16(v,8,0); write16(v,10,e.time); write16(v,12,e.date); write32(v,14,e.crc); write32(v,18,e.size); write32(v,22,e.size); write16(v,26,e.nameBytes.length); write16(v,28,0); return b;
}
function centralHeader(e) {
  const b = new Uint8Array(46), v = new DataView(b.buffer);
  write32(v,0,0x02014b50); write16(v,4,20); write16(v,6,20); write16(v,8,0x0800); write16(v,10,0); write16(v,12,e.time); write16(v,14,e.date); write32(v,16,e.crc); write32(v,20,e.size); write32(v,24,e.size); write16(v,28,e.nameBytes.length); write16(v,30,0); write16(v,32,0); write16(v,34,0); write16(v,36,0); write32(v,38,0); write32(v,42,e.offset); return b;
}
function endHeader(count, size, offset) {
  const b = new Uint8Array(22), v = new DataView(b.buffer);
  write32(v,0,0x06054b50); write16(v,4,0); write16(v,6,0); write16(v,8,count); write16(v,10,count); write32(v,12,size); write32(v,16,offset); write16(v,20,0); return b;
}
async function makeZip(files) {
  const entries = []; let offset = 0;
  for (let i = 0; i < files.length; i++) {
    const f = files[i], nameBytes = encoder.encode(f.name), s = stamp();
    progress(74 + ((i + 1) / files.length) * 24, `Pakuję ${i + 1}/${files.length} • ${noExt(f.name)}`, "Tworzę jeden ZIP…");
    const e = { nameBytes, blob:f.blob, size:f.blob.size, crc:await crc32(f.blob), time:s.time, date:s.date, offset };
    entries.push(e); offset += 30 + nameBytes.length + f.blob.size;
    if ((i + 1) % 2 === 0) await new Promise(r => setTimeout(r, 0));
  }
  const centralOffset = offset, parts = []; let centralSize = 0;
  for (const e of entries) parts.push(localHeader(e), e.nameBytes, e.blob);
  for (const e of entries) { const h = centralHeader(e); parts.push(h, e.nameBytes); centralSize += h.byteLength + e.nameBytes.length; }
  parts.push(endHeader(entries.length, centralSize, centralOffset));
  return new Blob(parts, { type:"application/zip" });
}

async function readPhoto(photo) {
  const paths = [...new Set([photo.originalPath, `galleries/${slug}/originals/${photo.filename}`].filter(Boolean))];
  let last;
  for (const path of paths) {
    try { return await getBlob(sRef(storage, path)); } catch (e) { last = e; }
  }
  throw last || new Error(`Nie znaleziono ${photo.filename}`);
}

async function saveZip(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.style.display = "none"; a.rel = "noopener";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 180000);
}

async function runZip(items, name) {
  if (!window.RAF_ZIP_READY) return toast("ZIP jeszcze się uruchamia. Spróbuj ponownie za chwilę.");
  if (busy) return toast("ZIP jest już przygotowywany.");
  if (!items.length) return toast("Brak zdjęć do pobrania.");
  busy = true;
  try {
    const files = [];
    for (let i = 0; i < items.length; i++) {
      const p = items[i];
      progress(((i + .15) / items.length) * 72, `${i + 1}/${items.length} • ${noExt(p.filename)}`, "Pobieram zdjęcia do ZIP…");
      files.push({ name:p.filename, blob:await readPhoto(p) });
      if ((i + 1) % 2 === 0) await new Promise(r => setTimeout(r, 0));
    }
    const zip = await makeZip(files);
    progress(100, `${items.length} zdjęć • gotowe`, "ZIP gotowy ✓");
    await saveZip(zip, `${safeName(name)}.zip`);
    toast(`Gotowe — jeden ZIP z ${items.length} zdjęciami.`);
    hideProgress(1500);
  } catch (e) {
    console.error("RAF ZIP v19.2", e);
    hideProgress(0);
    const msg = String(e?.message || e || "");
    if (/cors|failed to fetch|network|storage\/unknown/i.test(msg)) toast("Nie mogę odczytać zdjęć do ZIP przez Firebase Storage. Trzeba jednorazowo dopuścić domenę galeria.raf-studio.pl w CORS Storage.", 10000);
    else toast(`Błąd ZIP: ${msg}`, 8000);
  } finally { busy = false; refreshLabels(); }
}

function canonicalFromCard(card) {
  const label = $(".photo-filename", card)?.textContent?.trim().toLowerCase();
  if (!label) return "";
  return photos.find(p => noExt(p.filename).toLowerCase() === label)?.filename || "";
}
function manualSelected() {
  const names = new Set();
  $$("#grid .photo-card").forEach(card => {
    if ($(".photo-select-download", card)?.classList.contains("active")) {
      const n = canonicalFromCard(card); if (n) names.add(n);
    }
  });
  return photos.filter(p => names.has(p.filename));
}

function cloneTakeover(id, handler) {
  const old = document.getElementById(id); if (!old) return null;
  const fresh = old.cloneNode(true);
  old.replaceWith(fresh);
  fresh.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); handler(); }, true);
  return fresh;
}
function takeoverButtons() {
  buttons.all = cloneTakeover("downloadAllGalleryBtn", () => {
    if (!masterEnabled()) return toast("Pobieranie jest wyłączone dla tej galerii.");
    runZip(photos, gallery?.title || slug);
  });
  buttons.fav = cloneTakeover("downloadFavoritesBtn", () => {
    if (!favEnabled()) return toast("Pobieranie wybranych jest wyłączone.");
    runZip(photos.filter(p => favorites.has(p.filename)), `${gallery?.title || slug} - wybrane`);
  });
  buttons.favInline = cloneTakeover("downloadFavoritesInlineBtn", () => {
    if (!favEnabled()) return toast("Pobieranie wybranych jest wyłączone.");
    runZip(photos.filter(p => favorites.has(p.filename)), `${gallery?.title || slug} - wybrane`);
  });
  buttons.selected = cloneTakeover("downloadSelectedBtn", () => {
    if (!selectedEnabled()) return toast("Pobieranie zaznaczonych jest wyłączone.");
    runZip(manualSelected(), `${gallery?.title || slug} - zaznaczone`);
  });
}

function refreshLabels() {
  if (buttons.all) { buttons.all.hidden = !masterEnabled() || !photos.length; buttons.all.textContent = `↓ Pobierz całą galerię ZIP (${photos.length})`; }
  const fc = favorites.size;
  [buttons.fav, buttons.favInline].filter(Boolean).forEach(b => { b.hidden = !favEnabled() || !fc; b.textContent = `♥↓ Pobierz wybrane ZIP (${fc})`; });
  if (buttons.selected) {
    const n = manualSelected().length;
    if (n) buttons.selected.textContent = `↓ Pobierz ZIP (${n})`;
  }
}

function normalizeFavorites(raw) {
  const exact = new Set(photos.map(p => p.filename));
  const base = new Map(photos.map(p => [noExt(p.filename).toLowerCase(), p.filename]));
  const out = new Set();
  Object.values(raw || {}).forEach(x => {
    if (!x?.filename || x.rejected === true) return;
    const name = exact.has(x.filename) ? x.filename : base.get(noExt(x.filename).toLowerCase());
    if (name) out.add(name);
  });
  return out;
}

async function init() {
  if (!slug) return;
  injectProgress();
  takeoverButtons();
  try {
    for (let i = 0; i < 120 && !getApps().length; i++) await new Promise(r => setTimeout(r, 50));
    if (!getApps().length) throw new Error("Firebase nie został uruchomiony.");
    const app = getApp(), auth = getAuth(app); db = getDatabase(app); storage = getStorage(app);
    if (!auth.currentUser) await signInAnonymously(auth);
    const snap = await get(ref(db, `galleries/${slug}/public`));
    if (!snap.exists()) throw new Error("Nie znaleziono galerii.");
    gallery = snap.val();
    photos = Object.values(gallery.photos || {}).filter(p => p?.filename && p.hiddenFromClient !== true).sort((a,b) => a.filename.localeCompare(b.filename, undefined, {numeric:true}));
    window.RAF_ZIP_READY = true;
    refreshLabels();
    if (unsubscribe) unsubscribe();
    unsubscribe = onValue(ref(db, `selections/${slug}`), s => { favorites = normalizeFavorites(s.exists() ? s.val() : {}); refreshLabels(); });
    const grid = $("#grid");
    if (grid) new MutationObserver(() => refreshLabels()).observe(grid, {childList:true});
  } catch (e) {
    console.error("RAF ZIP init v19.2", e);
    window.RAF_ZIP_READY = false;
    toast(`Moduł ZIP nie wystartował: ${e?.message || e}`, 8000);
  }
}

init();
