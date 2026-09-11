import { getApps, getApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getDatabase, ref, get, onValue } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";
import { getStorage, ref as sRef, getBlob, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js";
import JSZip from "https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm";

const slug = new URLSearchParams(location.search).get("g") || "";
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

let gallery = null;
let photos = [];
let favoriteNames = new Set();
let manualDownloadNames = new Set();
let auth = null;
let db = null;
let storage = null;
let unsubscribeSelections = null;
let busy = false;

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

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

async function downloadZip(items, zipName, buttons = []) {
  if (busy) {
    toast("Jedno pobieranie ZIP jest już przygotowywane.");
    return;
  }
  if (!items.length) {
    toast("Brak zdjęć do pobrania.");
    return;
  }

  busy = true;
  const buttonStates = buttons.filter(Boolean).map(button => ({ button, text: button.textContent, disabled: button.disabled }));
  buttonStates.forEach(({ button }) => { button.disabled = true; });

  try {
    const zip = new JSZip();
    let previewFallbacks = 0;

    for (let i = 0; i < items.length; i++) {
      const photo = items[i];
      const collectProgress = ((i + 0.15) / items.length) * 82;
      showProgress(collectProgress, `${i + 1}/${items.length} • ${displayName(photo.filename)}`, "Pobieram zdjęcia do ZIP…");
      buttonStates.forEach(({ button }) => { button.textContent = `ZIP ${i + 1}/${items.length}`; });

      const result = await blobForPhoto(photo);
      if (result.source === "preview") previewFallbacks++;
      zip.file(photo.filename, result.blob, { binary: true });

      // Krótka przerwa oddaje sterowanie przeglądarce na telefonie.
      if ((i + 1) % 4 === 0) await new Promise(resolve => setTimeout(resolve, 0));
    }

    showProgress(84, "Pakuję pliki…", "Tworzę plik ZIP…");
    const zipBlob = await zip.generateAsync(
      { type: "blob", compression: "STORE", streamFiles: true, platform: "DOS" },
      meta => showProgress(84 + (meta.percent * 0.16), meta.currentFile ? `Pakuję: ${displayName(meta.currentFile)}` : "Finalizuję archiwum…", "Tworzę plik ZIP…")
    );

    showProgress(100, `${items.length} zdjęć • gotowe`, "ZIP gotowy ✓");
    saveBlob(zipBlob, `${safeFilename(zipName)}.zip`);

    if (previewFallbacks) {
      toast(`Pobrano ZIP (${items.length} zdjęć). ${previewFallbacks} plików było dostępnych tylko jako podgląd.`, 5200);
    } else {
      toast(`Pobrano ZIP: ${items.length} zdjęć.`);
    }
    hideProgress(1300);
  } catch (error) {
    console.error("RAF ZIP DOWNLOAD ERROR", error);
    hideProgress(0);
    const msg = String(error?.message || error || "");
    if (/cors|failed to fetch|network/i.test(msg)) {
      toast("ZIP nie może odczytać plików z Firebase (CORS). Pojedyncze pobieranie nadal działa — trzeba jednorazowo dopuścić domenę galeria.raf-studio.pl w CORS Storage.", 9000);
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
  if (selectedButton && manualDownloadNames.size > 0) {
    selectedButton.textContent = `↓ Pobierz ZIP (${manualDownloadNames.size})`;
  }
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
  if (grid) {
    new MutationObserver(() => syncManualSelectionFromVisibleCards()).observe(grid, { childList: true });
  }
}

async function initDownloads() {
  if (!slug) return;
  injectZipUi();
  installInteractionBridge();

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
  }
}

initDownloads();
