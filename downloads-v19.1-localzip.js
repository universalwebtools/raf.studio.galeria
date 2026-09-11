import { getApps, getApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getDatabase, ref, get, onValue } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";
import { getStorage, ref as sRef, getBlob, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js";

const slug = new URLSearchParams(location.search).get("g") || "";
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const encoder = new TextEncoder();

let gallery = null;
let photos = [];
let favoriteNames = new Set();
let manualDownloadNames = new Set();
let auth = null;
let db = null;
let storage = null;
let unsubscribeSelections = null;
let busy = false;

window.RAF_ZIP_READY = false;

function displayName(filename) {
  return String(filename || "").replace(/\.(jpe?g|png|webp)$/i, "");
}

function safeFilename(value, fallback = "RAF-studio-galeria") {
  const cleaned = String(value || "")
    .normalize("NFKD")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .trim();
  return cleaned || fallback;
}

function titleForZip() {
  return safeFilename(gallery?.title || slug || "RAF-studio-galeria");
}

function filenameMap() {
  return new Map(photos.map(photo => [displayName(photo.filename).toLowerCase(), photo.filename]));
}

function canonicalFilenameFromCard(card) {
  const text = card?.querySelector?.(".photo-filename")?.textContent?.trim() || "";
  if (!text) return "";
  return filenameMap().get(text.toLowerCase()) || "";
}

async function waitForFirebaseApp() {
  for (let i = 0; i < 120; i++) {
    if (getApps().length) return getApp();
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error("Firebase nie został uruchomiony.");
}

function toast(message, ms = 3200) {
  const el = $("#toast");
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
  clearTimeout(el._zipTimer);
  el._zipTimer = setTimeout(() => { el.hidden = true; }, ms);
}

function masterDownloadsEnabled() {
  return gallery?.downloadsEnabled !== false;
}

function favoriteDownloadsEnabled() {
  return masterDownloadsEnabled() && gallery?.uiConfig?.allowFavoriteDownloads !== false;
}

function selectedDownloadsEnabled() {
  return masterDownloadsEnabled() && gallery?.uiConfig?.allowSelectedDownloads !== false;
}

function injectZipUi() {
  if ($("#rafZipProgress")) return;
  const style = document.createElement("style");
  style.textContent = `
    #rafZipProgress{position:fixed;z-index:130000;left:50%;bottom:max(18px,env(safe-area-inset-bottom));transform:translateX(-50%);width:min(520px,calc(100% - 24px));padding:14px;border:1px solid #35353b;border-radius:16px;background:#111114ee;color:#f5f5f2;box-shadow:0 20px 70px #000a;backdrop-filter:blur(18px);font-family:system-ui,-apple-system,sans-serif}
    #rafZipProgress[hidden]{display:none!important}.raf-zip-head{display:flex;gap:12px;align-items:center}.raf-zip-head strong{font-size:13px}.raf-zip-head span{margin-left:auto;color:#aaa;font-size:11px}.raf-zip-track{height:7px;margin-top:10px;border-radius:999px;overflow:hidden;background:#2a2a2f}.raf-zip-bar{height:100%;width:0;background:#f4f4f1;transition:width .16s linear}.raf-zip-file{margin-top:8px;color:#929298;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  `;
  document.head.appendChild(style);
  document.body.insertAdjacentHTML("beforeend", `<div id="rafZipProgress" hidden><div class="raf-zip-head"><strong>Przygotowuję ZIP…</strong><span id="rafZipPercent">0%</span></div><div class="raf-zip-track"><div id="rafZipBar" class="raf-zip-bar"></div></div><div id="rafZipFile" class="raf-zip-file">Start…</div></div>`);
}

function showProgress(percent, text, heading = "Przygotowuję ZIP…") {
  injectZipUi();
  const box = $("#rafZipProgress");
  box.hidden = false;
  $(".raf-zip-head strong", box).textContent = heading;
  const p = Math.max(0, Math.min(100, Math.round(percent || 0)));
  $("#rafZipPercent").textContent = `${p}%`;
  $("#rafZipBar").style.width = `${p}%`;
  $("#rafZipFile").textContent = text || "";
}

function hideProgress(delay = 1000) {
  setTimeout(() => {
    const box = $("#rafZipProgress");
    if (box) box.hidden = true;
  }, delay);
}

async function blobForPhoto(photo) {
  const candidates = [photo.originalPath, `galleries/${slug}/originals/${photo.filename}`].filter(Boolean);
  let lastError = null;

  for (const path of [...new Set(candidates)]) {
    try {
      return { blob: await getBlob(sRef(storage, path)), source: "original" };
    } catch (error) {
      lastError = error;
      try {
        const url = await getDownloadURL(sRef(storage, path));
        const response = await fetch(url, { mode: "cors", credentials: "omit" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return { blob: await response.blob(), source: "original" };
      } catch (fallbackError) {
        lastError = fallbackError;
      }
    }
  }

  if (photo.previewUrl) {
    try {
      const response = await fetch(photo.previewUrl, { mode: "cors", credentials: "omit" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return { blob: await response.blob(), source: "preview" };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error(`Nie znaleziono pliku ${photo.filename}`);
}

function writeU16(view, offset, value) {
  view.setUint16(offset, value & 0xffff, true);
}

function writeU32(view, offset, value) {
  view.setUint32(offset, value >>> 0, true);
}

let crcTable = null;
function getCrcTable() {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    crcTable[n] = c >>> 0;
  }
  return crcTable;
}

async function crc32OfBlob(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: ((date.getHours() & 31) << 11) | ((date.getMinutes() & 63) << 5) | ((Math.floor(date.getSeconds() / 2)) & 31),
    date: (((year - 1980) & 127) << 9) | (((date.getMonth() + 1) & 15) << 5) | (date.getDate() & 31)
  };
}

function localHeader(entry) {
  const bytes = new Uint8Array(30);
  const view = new DataView(bytes.buffer);
  writeU32(view, 0, 0x04034b50);
  writeU16(view, 4, 20);
  writeU16(view, 6, 0x0800);
  writeU16(view, 8, 0);
  writeU16(view, 10, entry.time);
  writeU16(view, 12, entry.date);
  writeU32(view, 14, entry.crc);
  writeU32(view, 18, entry.size);
  writeU32(view, 22, entry.size);
  writeU16(view, 26, entry.nameBytes.length);
  writeU16(view, 28, 0);
  return bytes;
}

function centralHeader(entry) {
  const bytes = new Uint8Array(46);
  const view = new DataView(bytes.buffer);
  writeU32(view, 0, 0x02014b50);
  writeU16(view, 4, 20);
  writeU16(view, 6, 20);
  writeU16(view, 8, 0x0800);
  writeU16(view, 10, 0);
  writeU16(view, 12, entry.time);
  writeU16(view, 14, entry.date);
  writeU32(view, 16, entry.crc);
  writeU32(view, 20, entry.size);
  writeU32(view, 24, entry.size);
  writeU16(view, 28, entry.nameBytes.length);
  writeU16(view, 30, 0);
  writeU16(view, 32, 0);
  writeU16(view, 34, 0);
  writeU16(view, 36, 0);
  writeU32(view, 38, 0);
  writeU32(view, 42, entry.offset);
  return bytes;
}

function endOfCentralDirectory(count, centralSize, centralOffset) {
  const bytes = new Uint8Array(22);
  const view = new DataView(bytes.buffer);
  writeU32(view, 0, 0x06054b50);
  writeU16(view, 4, 0);
  writeU16(view, 6, 0);
  writeU16(view, 8, count);
  writeU16(view, 10, count);
  writeU32(view, 12, centralSize);
  writeU32(view, 16, centralOffset);
  writeU16(view, 20, 0);
  return bytes;
}

async function buildStoredZip(files, onProgress) {
  if (files.length > 65535) throw new Error("Za dużo plików w jednym ZIP.");

  const entries = [];
  let offset = 0;

  for (let i = 0; i < files.length; i++) {
    const item = files[i];
    onProgress?.(i, files.length, item.name, "crc");
    const nameBytes = encoder.encode(item.name);
    const crc = await crc32OfBlob(item.blob);
    const stamp = dosDateTime();
    const entry = {
      name: item.name,
      nameBytes,
      blob: item.blob,
      size: item.blob.size,
      crc,
      time: stamp.time,
      date: stamp.date,
      offset
    };
    entries.push(entry);
    offset += 30 + nameBytes.length + item.blob.size;
    if ((i + 1) % 3 === 0) await new Promise(resolve => setTimeout(resolve, 0));
  }

  const centralOffset = offset;
  let centralSize = 0;
  const parts = [];

  for (const entry of entries) parts.push(localHeader(entry), entry.nameBytes, entry.blob);
  for (const entry of entries) {
    const header = centralHeader(entry);
    parts.push(header, entry.nameBytes);
    centralSize += header.byteLength + entry.nameBytes.length;
  }
  parts.push(endOfCentralDirectory(entries.length, centralSize, centralOffset));

  return new Blob(parts, { type: "application/zip" });
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 120000);
}

async function downloadZip(items, zipName, buttons = []) {
  if (busy) return toast("Jedno pobieranie ZIP jest już przygotowywane.");
  if (!items.length) return toast("Brak zdjęć do pobrania.");

  busy = true;
  const buttonStates = buttons.filter(Boolean).map(button => ({ button, text: button.textContent, disabled: button.disabled }));
  buttonStates.forEach(({ button }) => { button.disabled = true; });

  try {
    const files = [];
    let previewFallbacks = 0;

    for (let i = 0; i < items.length; i++) {
      const photo = items[i];
      const collectProgress = ((i + 0.1) / items.length) * 72;
      showProgress(collectProgress, `${i + 1}/${items.length} • ${displayName(photo.filename)}`, "Pobieram zdjęcia do ZIP…");
      buttonStates.forEach(({ button }) => { button.textContent = `ZIP ${i + 1}/${items.length}`; });

      const result = await blobForPhoto(photo);
      if (result.source === "preview") previewFallbacks++;
      files.push({ name: photo.filename, blob: result.blob });

      if ((i + 1) % 3 === 0) await new Promise(resolve => setTimeout(resolve, 0));
    }

    showProgress(74, "Sprawdzam pliki…", "Tworzę jeden ZIP…");
    const zipBlob = await buildStoredZip(files, (index, total, name) => {
      const percent = 74 + ((index + 1) / total) * 25;
      showProgress(percent, `Pakuję ${index + 1}/${total} • ${displayName(name)}`, "Tworzę jeden ZIP…");
    });

    showProgress(100, `${items.length} zdjęć • gotowe`, "ZIP gotowy ✓");
    saveBlob(zipBlob, `${safeFilename(zipName)}.zip`);

    if (previewFallbacks) toast(`Pobrano ZIP (${items.length} zdjęć). ${previewFallbacks} plików było dostępnych tylko jako podgląd.`, 5200);
    else toast(`Pobrano jeden ZIP: ${items.length} zdjęć.`);
    hideProgress(1500);
  } catch (error) {
    console.error("RAF LOCAL ZIP DOWNLOAD ERROR", error);
    hideProgress(0);
    const msg = String(error?.message || error || "");
    if (/cors|failed to fetch|network|storage\/unknown/i.test(msg)) {
      toast("Nie mogę jeszcze zbudować ZIP-a: przeglądarka nie może odczytać plików z Firebase (CORS). Nie uruchamiam już pobierania pojedynczych JPG. Trzeba dopuścić galeria.raf-studio.pl w CORS Storage.", 10000);
    } else {
      toast(`Błąd tworzenia ZIP: ${msg}`, 7000);
    }
  } finally {
    busy = false;
    buttonStates.forEach(({ button, text, disabled }) => {
      button.disabled = disabled;
      button.textContent = text;
    });
    updateButtons();
  }
}

async function downloadWholeGalleryZip() {
  if (!masterDownloadsEnabled()) return toast("Pobieranie jest wyłączone dla tej galerii.");
  if (!photos.length) return toast("Brak zdjęć w galerii.");
  await downloadZip(photos, titleForZip(), [$("#downloadAllGalleryBtn")]);
}

async function downloadFavoritesZip() {
  if (!favoriteDownloadsEnabled()) return toast("Pobieranie zdjęć wybranych serduszkiem jest wyłączone.");
  const selected = photos.filter(photo => favoriteNames.has(photo.filename));
  if (!selected.length) return toast("Najpierw wybierz zdjęcia serduszkiem ♥.");
  await downloadZip(selected, `${titleForZip()} - wybrane`, [$("#downloadFavoritesBtn"), $("#downloadFavoritesInlineBtn")]);
}

async function downloadManualSelectionZip() {
  if (!selectedDownloadsEnabled()) return toast("Pobieranie zaznaczonych zdjęć jest wyłączone.");
  const selected = photos.filter(photo => manualDownloadNames.has(photo.filename));
  if (!selected.length) return toast("Najpierw zaznacz zdjęcia kółkiem ○/✓.");
  await downloadZip(selected, `${titleForZip()} - zaznaczone`, [$("#downloadSelectedBtn")]);
}

function updateButtons() {
  const allButton = $("#downloadAllGalleryBtn");
  const favoriteCount = favoriteNames.size;
  const canFavorites = favoriteDownloadsEnabled() && favoriteCount > 0;

  if (allButton) {
    allButton.hidden = !masterDownloadsEnabled() || photos.length === 0;
    allButton.textContent = `↓ Pobierz całą galerię ZIP (${photos.length})`;
  }

  [$("#downloadFavoritesBtn"), $("#downloadFavoritesInlineBtn")].filter(Boolean).forEach(button => {
    button.hidden = !canFavorites;
    button.textContent = `♥↓ Pobierz wybrane ZIP (${favoriteCount})`;
  });

  const selectedButton = $("#downloadSelectedBtn");
  if (selectedButton && manualDownloadNames.size > 0) selectedButton.textContent = `↓ Pobierz ZIP (${manualDownloadNames.size})`;
}

function normalizeFavorites(raw) {
  const currentExact = new Set(photos.map(photo => photo.filename));
  const byBase = new Map(photos.map(photo => [displayName(photo.filename).toLowerCase(), photo.filename]));
  const result = new Set();
  Object.values(raw || {}).forEach(item => {
    if (!item?.filename || item.rejected === true) return;
    const canonical = currentExact.has(item.filename) ? item.filename : byBase.get(displayName(item.filename).toLowerCase());
    if (canonical) result.add(canonical);
  });
  return result;
}

function syncManualSelectionFromVisibleCards() {
  $$("#grid .photo-card").forEach(card => {
    const button = $(".photo-select-download", card);
    if (!button?.classList.contains("active")) return;
    const filename = canonicalFilenameFromCard(card);
    if (filename) manualDownloadNames.add(filename);
  });
  updateButtons();
}

function installInteractionBridge() {
  document.addEventListener("click", event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const bulkButton = target.closest("#downloadAllGalleryBtn,#downloadFavoritesBtn,#downloadFavoritesInlineBtn,#downloadSelectedBtn");
    if (bulkButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (bulkButton.id === "downloadAllGalleryBtn") downloadWholeGalleryZip();
      else if (bulkButton.id === "downloadSelectedBtn") downloadManualSelectionZip();
      else downloadFavoritesZip();
      return;
    }

    const selectButton = target.closest(".photo-select-download");
    if (selectButton) {
      const card = selectButton.closest(".photo-card");
      const filename = canonicalFilenameFromCard(card);
      if (filename) {
        if (selectButton.classList.contains("active")) manualDownloadNames.delete(filename);
        else manualDownloadNames.add(filename);
        setTimeout(updateButtons, 0);
      }
      return;
    }

    if (target.closest("#clearDownloadSelectionBtn")) {
      manualDownloadNames.clear();
      setTimeout(updateButtons, 0);
      return;
    }

    const reject = target.closest(".photo-reject");
    if (reject && !reject.classList.contains("active")) {
      const filename = canonicalFilenameFromCard(reject.closest(".photo-card"));
      if (filename) manualDownloadNames.delete(filename);
    }
  }, true);

  const grid = $("#grid");
  if (grid) new MutationObserver(() => syncManualSelectionFromVisibleCards()).observe(grid, { childList: true });
}

async function initDownloads() {
  if (!slug) return;
  injectZipUi();
  installInteractionBridge();
  window.RAF_ZIP_READY = true;

  try {
    const app = await waitForFirebaseApp();
    auth = getAuth(app);
    db = getDatabase(app);
    storage = getStorage(app);
    if (!auth.currentUser) await signInAnonymously(auth);

    const snap = await get(ref(db, `galleries/${slug}/public`));
    if (!snap.exists()) return;

    gallery = snap.val();
    photos = Object.values(gallery.photos || {})
      .filter(item => item?.filename && item?.hiddenFromClient !== true)
      .sort((a, b) => a.filename.localeCompare(b.filename, undefined, { numeric: true }));

    updateButtons();

    if (unsubscribeSelections) unsubscribeSelections();
    unsubscribeSelections = onValue(ref(db, `selections/${slug}`), snapshot => {
      favoriteNames = normalizeFavorites(snapshot.exists() ? snapshot.val() : {});
      updateButtons();
    });
  } catch (error) {
    console.error("RAF ZIP downloads init error", error);
    toast(`Moduł ZIP nie wystartował: ${error?.message || error}`, 7000);
  }
}

initDownloads();