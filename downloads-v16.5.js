import { getApps, getApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getDatabase, ref, get, onValue } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";
import { getStorage, ref as sRef, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js";

const slug = new URLSearchParams(location.search).get("g") || "";
const $ = (selector) => document.querySelector(selector);

let gallery = null;
let photos = [];
let favoriteNames = new Set();
let auth = null;
let db = null;
let storage = null;
let unsubscribeSelections = null;

function displayName(filename) {
  return String(filename || "").replace(/\.(jpe?g|png|webp)$/i, "");
}

async function waitForFirebaseApp() {
  for (let i = 0; i < 80; i++) {
    if (getApps().length) return getApp();
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error("Firebase nie został uruchomiony.");
}

function toast(message) {
  const el = $("#toast");
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
  clearTimeout(el._downloadsTimer);
  el._downloadsTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

function masterDownloadsEnabled() {
  return gallery?.downloadsEnabled !== false;
}

function favoriteDownloadsEnabled() {
  return masterDownloadsEnabled() && gallery?.uiConfig?.allowFavoriteDownloads !== false;
}

function startAttachmentDownload(url, filename) {
  const frame = document.createElement("iframe");
  frame.className = "raf-download-frame";
  frame.title = `Pobieranie ${filename}`;
  frame.src = url;
  document.body.appendChild(frame);
  setTimeout(() => frame.remove(), 90000);
}

async function originalUrl(photo) {
  const candidates = [
    photo.originalPath,
    `galleries/${slug}/originals/${photo.filename}`
  ].filter(Boolean);

  for (const path of [...new Set(candidates)]) {
    try {
      return await getDownloadURL(sRef(storage, path));
    } catch (_) {}
  }

  return photo.previewUrl || null;
}

async function downloadMany(items, button, label) {
  if (!items.length) {
    toast("Brak zdjęć do pobrania.");
    return;
  }

  const previous = button?.textContent || label;
  if (button) button.disabled = true;

  try {
    for (let i = 0; i < items.length; i++) {
      const photo = items[i];
      if (button) button.textContent = `↓ ${i + 1}/${items.length}`;
      const url = await originalUrl(photo);
      if (url) startAttachmentDownload(url, photo.filename);
      await new Promise(resolve => setTimeout(resolve, 1050));
    }
    toast(`Uruchomiono pobieranie ${items.length} zdjęć.`);
  } catch (error) {
    console.error("RAF DOWNLOADS v16.5", error);
    toast(`Błąd pobierania: ${error.message || error}`);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = previous;
    }
    updateButtons();
  }
}

async function downloadWholeGallery() {
  if (!masterDownloadsEnabled()) {
    toast("Pobieranie jest wyłączone dla tej galerii.");
    return;
  }
  if (!photos.length) return;

  if (!confirm(`Pobrać całą galerię (${photos.length} zdjęć)?\n\nPrzeglądarka może poprosić o zgodę na pobieranie wielu plików.`)) return;
  await downloadMany(photos, $("#downloadAllGalleryBtn"), "↓ Pobierz całą galerię");
}

async function downloadFavoriteGallery() {
  if (!favoriteDownloadsEnabled()) {
    toast("Pobieranie zdjęć wybranych serduszkiem jest wyłączone.");
    return;
  }

  const selected = photos.filter(photo => favoriteNames.has(photo.filename));
  if (!selected.length) {
    toast("Najpierw wybierz zdjęcia serduszkiem ♥.");
    return;
  }

  if (selected.length >= 20 && !confirm(`Pobrać ${selected.length} zdjęć wybranych serduszkiem?\n\nPrzeglądarka może poprosić o zgodę na pobieranie wielu plików.`)) return;
  await downloadMany(selected, $("#downloadFavoritesV165Btn"), "♥↓ Pobierz wybrane");
}

function updateButtons() {
  const allButton = $("#downloadAllGalleryBtn");
  const newFavButton = $("#downloadFavoritesV165Btn");
  const oldFavButton = $("#downloadFavoritesBtn");
  const favoriteCount = favoriteNames.size;

  if (allButton) {
    allButton.hidden = !masterDownloadsEnabled() || photos.length === 0;
    allButton.textContent = `↓ Pobierz całą galerię (${photos.length})`;
  }

  const canFavorites = favoriteDownloadsEnabled() && favoriteCount > 0;

  if (newFavButton) {
    newFavButton.hidden = !canFavorites;
    newFavButton.textContent = `♥↓ Pobierz wybrane (${favoriteCount})`;
  }

  // Naprawa istniejącego górnego przycisku: przy zaznaczonych serduszkach
  // ma być zawsze widoczny, jeśli pobieranie wybranych jest dozwolone.
  if (oldFavButton) {
    oldFavButton.hidden = !canFavorites;
    oldFavButton.textContent = `♥↓ Pobierz wybrane (${favoriteCount})`;
  }
}

function normalizeFavorites(raw) {
  const currentExact = new Set(photos.map(photo => photo.filename));
  const byBase = new Map(photos.map(photo => [displayName(photo.filename).toLowerCase(), photo.filename]));
  const result = new Set();

  Object.values(raw || {}).forEach(item => {
    if (!item?.filename || item.rejected === true) return;
    const canonical = currentExact.has(item.filename)
      ? item.filename
      : byBase.get(displayName(item.filename).toLowerCase());
    if (canonical) result.add(canonical);
  });

  return result;
}

async function initDownloads() {
  if (!slug) return;

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
    console.error("RAF downloads v16.5 init error", error);
  }
}

$("#downloadAllGalleryBtn")?.addEventListener("click", downloadWholeGallery);
$("#downloadFavoritesV165Btn")?.addEventListener("click", downloadFavoriteGallery);

initDownloads();
