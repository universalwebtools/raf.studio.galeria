import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getDatabase, ref, get, set, remove } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";
import { getStorage, ref as sRef, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js";
import { firebaseConfig } from "./firebase-config.js?v=12.2";

const fb = initializeApp(firebaseConfig);
const auth = getAuth(fb);
const db = getDatabase(fb);
const storage = getStorage(fb);

const $ = (selector) => document.querySelector(selector);
const slug = new URLSearchParams(location.search).get("g") || "";

let uid = null;
let downloadSelection = new Set();
let gallery = null;
let photos = [];
let favorites = new Map();
let currentIndex = 0;
let filter = "all";
let touchStartX = 0;

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function normalizePassword(value) {
  return String(value ?? "").trim();
}

async function passwordMatches(entered) {
  if (!gallery) return false;

  const raw = String(entered ?? "");
  const trimmed = normalizePassword(raw);

  // v11.1 and newer
  const trimmedHash = await sha256(trimmed);
  if (gallery.passwordHashTrimmed && trimmedHash === gallery.passwordHashTrimmed) return true;

  // Existing galleries created by older versions.
  if (gallery.passwordHash) {
    if (trimmedHash === gallery.passwordHash) return true;

    if (raw !== trimmed) {
      const rawHash = await sha256(raw);
      if (rawHash === gallery.passwordHash) return true;
    }
  }

  // Very old compatibility only if such a field exists.
  if (typeof gallery.password === "string") {
    return raw === gallery.password || trimmed === gallery.password.trim();
  }

  return false;
}

async function getCurrentClientUid() {
  if (auth.currentUser) return auth.currentUser.uid;

  const credential = await signInAnonymously(auth);
  uid = credential.user.uid;
  return uid;
}

function selectionKey(filename) {
  const bytes = new TextEncoder().encode(filename);
  let binary = "";
  bytes.forEach(b => binary += String.fromCharCode(b));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.hidden = false;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.hidden = true, 2200);
}

function maxFavorites() {
  return Number(gallery?.maxFavorites || 0);
}

function isExpired() {
  if (!gallery?.expiresAt) return false;
  return new Date(`${gallery.expiresAt}T23:59:59`) < new Date();
}

function showFatal(message) {
  $("#galleryNotFound").textContent = message;
  $("#galleryNotFound").hidden = false;
  $("#passwordForm").hidden = true;
}

async function init() {
  if (!slug) {
    showFatal("Brak identyfikatora galerii w linku.");
    return;
  }

  try {
    const credential = await signInAnonymously(auth);
    uid = credential.user.uid;

    const publicSnap = await get(ref(db, `galleries/${slug}/public`));
    if (!publicSnap.exists()) {
      showFatal("Galeria nie istnieje.");
      return;
    }

    gallery = publicSnap.val();

    if (gallery.active === false) {
      showFatal("Galeria została wyłączona.");
      return;
    }

    if (isExpired()) {
      showFatal("Dostęp do galerii wygasł.");
      return;
    }

    applyGalleryMeta();

    if (sessionStorage.getItem(`raf-access-${slug}`) === "1") {
      await openGallery();
    }
  } catch (error) {
    console.error("INIT ERROR", error);
    showFatal(`Nie udało się uruchomić galerii: ${error.code || error.message || error}`);
  }
}

function applyGalleryMeta() {
  $("#lockTitle").textContent = gallery.title || "Galeria klienta";
  $("#heroTitle").textContent = gallery.title || slug;
  $("#heroSubtitle").textContent = gallery.subtitle || "Wybierz ulubione zdjęcia.";

  if (gallery.expiresAt) {
    $("#expiryLabel").textContent = `Dostęp do ${gallery.expiresAt}`;
  }

  if (maxFavorites() > 0) {
    $("#maxFavoritesLabel").textContent = ` / ${maxFavorites()}`;
    $("#progressWrap").hidden = false;
  }
}

async function openGallery() {
  // Open immediately after password validation.
  $("#lockScreen").hidden = true;
  $("#galleryView").hidden = false;
  $("#loading").hidden = false;

  loadManifest();

  // Favorites are secondary. A permissions/network problem here
  // must NEVER make correct password look broken.
  loadFavorites()
    .then(() => {
      render();
      updateUI();
    })
    .catch(error => {
      console.error("BACKGROUND FAVORITES ERROR", error);
    });
}

async function loadFavorites() {
  try {
    const currentUid = await getCurrentClientUid();
    const snap = await get(ref(db, `favorites/${slug}/${currentUid}`));
    favorites.clear();

    if (snap.exists()) {
      Object.values(snap.val() || {}).forEach(item => {
        if (item?.filename) favorites.set(item.filename, item);
      });
    }
  } catch (error) {
    console.error("LOAD FAVORITES ERROR", error);
    // Gallery remains usable even if favorites cannot be read.
  }
}

function loadManifest() {
  const manifest = gallery.photos || {};

  photos = Object.values(manifest)
    .filter(item => item?.filename && item?.previewUrl)
    .sort((a, b) => a.filename.localeCompare(b.filename, undefined, { numeric: true }))
    .map(item => ({
      filename: item.filename,
      preview: item.previewUrl,
      originalPath: item.originalPath || `galleries/${slug}/originals/${item.filename}`,
      originalUrl: null
    }));

  $("#loading").hidden = true;
  $("#photoCountHero").textContent = `${photos.length} zdjęć`;

  if (!photos.length) {
    $("#storageError").hidden = false;
    $("#storageError").textContent = "W tej galerii nie ma jeszcze zdjęć.";
    render();
    return;
  }

  const cover = photos.find(p => p.filename === gallery.coverFile) || photos[0];
  if (cover) $("#hero").style.backgroundImage = `url("${cover.preview}")`;

  render();
}

function render() {
  const list = filter === "favorites"
    ? photos.filter(photo => favorites.has(photo.filename))
    : photos;

  const grid = $("#grid");
  grid.innerHTML = "";

  if (!list.length) {
    grid.innerHTML = filter === "favorites"
      ? '<div class="notice">Nie zaznaczono jeszcze żadnych zdjęć.</div>'
      : "";
    updateUI();
    return;
  }

  list.forEach(photo => {
    const index = photos.findIndex(p => p.filename === photo.filename);
    const selected = favorites.has(photo.filename);

    const card = document.createElement("article");
    card.className = "photo-card";

    const skeleton = document.createElement("div");
    skeleton.className = "photo-skeleton";

    const img = document.createElement("img");
    img.loading = "lazy";
    img.alt = photo.filename;
    img.src = photo.preview;

    const tools = document.createElement("div");
    tools.className = "photo-card-tools";

    const heart = document.createElement("button");
    heart.type = "button";
    heart.className = `photo-fav${selected ? " active" : ""}`;
    heart.textContent = selected ? "♥" : "♡";
    heart.title = selected ? "Usuń z wybranych dla fotografa" : "Dodaj do wybranych dla fotografa";
    heart.setAttribute("aria-label", heart.title);
    heart.setAttribute("aria-pressed", selected ? "true" : "false");

    const downloadOne = document.createElement("button");
    downloadOne.type = "button";
    downloadOne.className = "photo-download";
    downloadOne.textContent = "↓";
    downloadOne.title = "Pobierz to zdjęcie";
    downloadOne.setAttribute("aria-label", downloadOne.title);

    const selectDownload = document.createElement("button");
    selectDownload.type = "button";
    selectDownload.className = `photo-select-download${downloadSelection.has(photo.filename) ? " active" : ""}`;
    selectDownload.textContent = downloadSelection.has(photo.filename) ? "✓" : "○";
    selectDownload.title = "Zaznacz do pobrania";
    selectDownload.setAttribute("aria-label", selectDownload.title);
    selectDownload.setAttribute("aria-pressed", downloadSelection.has(photo.filename) ? "true" : "false");

    img.addEventListener("load", () => {
      img.classList.add("loaded");
      card.classList.add("is-loaded");
    });

    if (img.complete && img.naturalWidth > 0) {
      img.classList.add("loaded");
      card.classList.add("is-loaded");
    }

    img.addEventListener("click", () => openLightbox(index));

    heart.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await toggleFavorite(photo.filename);
    });

    downloadOne.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await downloadSinglePhoto(index);
    });

    selectDownload.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleDownloadSelection(photo.filename);
    });

    tools.append(heart, downloadOne, selectDownload);
    card.append(skeleton, img, tools);
    grid.appendChild(card);
  });

  updateUI();
}

async function toggleFavorite(filename) {
  const wasSelected = favorites.has(filename);

  if (!wasSelected && maxFavorites() > 0 && favorites.size >= maxFavorites()) {
    toast(`Możesz wybrać maksymalnie ${maxFavorites()} zdjęć.`);
    return;
  }

  const optimisticValue = { filename, selectedAt: Date.now() };

  if (wasSelected) favorites.delete(filename);
  else favorites.set(filename, optimisticValue);

  render();

  try {
    const currentUid = await getCurrentClientUid();
    const target = ref(db, `favorites/${slug}/${currentUid}/${selectionKey(filename)}`);

    if (wasSelected) {
      await remove(target);
    } else {
      await set(target, optimisticValue);
    }

    toast(wasSelected ? "Usunięto z wybranych" : "Dodano do wybranych");
  } catch (error) {
    console.error("FAVORITE WRITE ERROR", error);

    if (wasSelected) favorites.set(filename, optimisticValue);
    else favorites.delete(filename);

    render();
    if(String(error.code||"").toUpperCase().includes("PERMISSION")){
      toast("Brak uprawnień Firebase — wklej reguły v11.2 i kliknij Publish.");
    }else{
      toast(`Błąd zapisu wyboru: ${error.code || error.message || error}`);
    }
  }
}

function updateUI() {
  const count = favorites.size;

  $("#favCount").textContent = count;
  $("#selectedCount").textContent = count;

  if (maxFavorites() > 0) {
    const percent = Math.min(100, (count / maxFavorites()) * 100);
    $("#selectProgress").style.width = `${percent}%`;
    $("#progressText").textContent = `${count} z ${maxFavorites()} wybranych`;
  }

  updateDownloadUI();
}


function toggleDownloadSelection(filename) {
  if (downloadSelection.has(filename)) {
    downloadSelection.delete(filename);
  } else {
    downloadSelection.add(filename);
  }
  render();
}

function updateDownloadUI() {
  const count = downloadSelection.size;
  const bar = $("#downloadBar");
  if (!bar) return;

  $("#downloadSelectedCount").textContent = count;
  bar.hidden = count === 0;

  const button = $("#downloadSelectedBtn");
  if (button) {
    button.textContent = count > 0
      ? `↓ Pobierz wybrane (${count})`
      : "↓ Pobierz wybrane";
  }
}

function startAttachmentDownload(url, filename) {
  // No fetch(), no Blob(), no CORS.
  // Firebase Storage must return Content-Disposition: attachment.
  const frame = document.createElement("iframe");
  frame.className = "raf-download-frame";
  frame.title = `Pobieranie ${filename}`;
  frame.src = url;

  document.body.appendChild(frame);

  // Keep it alive long enough for browser to start the download.
  setTimeout(() => frame.remove(), 90000);
}

async function downloadSinglePhoto(index) {
  if (gallery.downloadsEnabled === false) {
    toast("Pobieranie zdjęć jest wyłączone dla tej galerii.");
    return;
  }

  const photo = photos[index];
  if (!photo) return;

  try {
    toast("Rozpoczynam pobieranie…");
    const url = await getOriginalUrl(index);
    if (!url) throw new Error("Brak oryginału.");

    startAttachmentDownload(url, photo.filename);
  } catch (error) {
    console.error("SINGLE DOWNLOAD ERROR", error);
    toast(`Nie udało się pobrać: ${error.message || error}`);
  }
}

async function downloadSelectedFiles() {
  if (gallery.downloadsEnabled === false) {
    toast("Pobieranie zdjęć jest wyłączone dla tej galerii.");
    return;
  }

  const selected = photos.filter(photo => downloadSelection.has(photo.filename));

  if (!selected.length) {
    toast("Najpierw zaznacz zdjęcia do pobrania.");
    return;
  }

  const button = $("#downloadSelectedBtn");
  button.disabled = true;

  try {
    for (let i = 0; i < selected.length; i++) {
      const photo = selected[i];
      const index = photos.findIndex(p => p.filename === photo.filename);

      button.textContent = `Pobieram ${i + 1}/${selected.length}…`;

      const url = await getOriginalUrl(index);
      if (!url) continue;

      startAttachmentDownload(url, photo.filename);

      // spacing for Chrome multi-download handling
      await new Promise(resolve => setTimeout(resolve, 1100));
    }

    toast(`Uruchomiono pobieranie ${selected.length} zdjęć.`);
    downloadSelection.clear();
    render();
  } catch (error) {
    console.error("MULTI DOWNLOAD ERROR", error);
    toast(`Błąd pobierania: ${error.message || error}`);
  } finally {
    button.disabled = false;
    updateDownloadUI();
  }
}

async function getOriginalUrl(index) {
  const photo = photos[index];
  if (!photo) return null;

  if (photo.originalUrl) return photo.originalUrl;

  // Never trust an old manifest path here.
  // Original filename is authoritative.
  const originalRef = sRef(
    storage,
    `galleries/${slug}/originals/${photo.filename}`
  );

  try {
    photo.originalUrl = await getDownloadURL(originalRef);
    return photo.originalUrl;
  } catch (error) {
    console.error("ORIGINAL DOWNLOAD URL ERROR", photo.filename, error);
    throw new Error(`Nie znaleziono oryginału ${photo.filename}`);
  }
}

async function openLightbox(index) {
  currentIndex = index;
  const photo = photos[index];

  $("#lightbox").hidden = false;
  document.body.style.overflow = "hidden";
  $("#lightboxImage").src = photo.preview;

  updateLightboxUI();

  const original = await getOriginalUrl(index);
  if (currentIndex === index && original) {
    $("#lightboxImage").src = original;
    $("#lightboxDownload").href = original;
  }
}

function updateLightboxUI() {
  const photo = photos[currentIndex];
  if (!photo) return;

  const selected = favorites.has(photo.filename);

  $("#lightboxCaption").textContent = `${currentIndex + 1} / ${photos.length} · ${photo.filename}`;
  $("#lightboxFav").textContent = selected ? "♥" : "♡";
  $("#lightboxFav").classList.toggle("active", selected);
  $("#lightboxDownload").hidden = gallery.downloadsEnabled === false;

  if (photo.originalUrl) $("#lightboxDownload").href = photo.originalUrl;
}

async function changeLightbox(delta) {
  currentIndex = (currentIndex + delta + photos.length) % photos.length;
  const photo = photos[currentIndex];

  $("#lightboxImage").src = photo.preview;
  updateLightboxUI();

  const original = await getOriginalUrl(currentIndex);
  if (original) {
    $("#lightboxImage").src = original;
    $("#lightboxDownload").href = original;
  }
}

function closeLightbox() {
  $("#lightbox").hidden = true;
  document.body.style.overflow = "";
}

$("#passwordForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  const input = $("#passwordInput");
  const errorEl = $("#passwordError");
  const submitButton = $("#passwordForm").querySelector('button[type="submit"]');

  errorEl.hidden = true;
  submitButton.disabled = true;
  submitButton.textContent = "Sprawdzanie…";

  try {
    if (!gallery) {
      throw new Error("Dane galerii nie zostały jeszcze wczytane. Odśwież stronę.");
    }

    const entered = input.value;

    if (!normalizePassword(entered)) {
      errorEl.textContent = "Wpisz hasło.";
      errorEl.hidden = false;
      return;
    }

    const ok = await passwordMatches(entered);

    if (!ok) {
      errorEl.textContent = "Nieprawidłowe hasło.";
      errorEl.hidden = false;
      input.select();
      return;
    }

    sessionStorage.setItem(`raf-access-${slug}`, "1");
    await openGallery();
  } catch (error) {
    console.error("LOGIN ERROR", error);
    errorEl.textContent = `Błąd logowania: ${error.code || error.message || error}`;
    errorEl.hidden = false;
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Otwórz galerię";
  }
});

$("#allFilter").addEventListener("click", () => {
  filter = "all";
  $("#allFilter").classList.add("active");
  $("#favFilter").classList.remove("active");
  render();
});

$("#favFilter").addEventListener("click", () => {
  filter = "favorites";
  $("#favFilter").classList.add("active");
  $("#allFilter").classList.remove("active");
  render();
});

$("#favoritesToggle").addEventListener("click", () => $("#favFilter").click());

$("#shareBtn").addEventListener("click", async () => {
  try {
    if (navigator.share) {
      await navigator.share({ title: gallery.title || "Galeria RAF.studio", url: location.href });
    } else {
      await navigator.clipboard.writeText(location.href);
      toast("Link skopiowany");
    }
  } catch (_) {}
});

$("#logoutBtn").addEventListener("click", () => {
  sessionStorage.removeItem(`raf-access-${slug}`);
  location.reload();
});

$("#closeLightbox").addEventListener("click", closeLightbox);
$("#prevPhoto").addEventListener("click", () => changeLightbox(-1));
$("#nextPhoto").addEventListener("click", () => changeLightbox(1));

$("#lightboxFav").addEventListener("click", async () => {
  const photo = photos[currentIndex];
  if (!photo) return;
  await toggleFavorite(photo.filename);
  updateLightboxUI();
});

$("#lightboxDownload").addEventListener("click", async (event) => {
  const photo = photos[currentIndex];
  if (!photo) return;

  if (!photo.originalUrl) {
    event.preventDefault();
    const url = await getOriginalUrl(currentIndex);
    if (url) window.open(url, "_blank", "noopener");
  }
});

document.addEventListener("keydown", (event) => {
  if ($("#lightbox").hidden) return;
  if (event.key === "Escape") closeLightbox();
  if (event.key === "ArrowLeft") changeLightbox(-1);
  if (event.key === "ArrowRight") changeLightbox(1);
});

$("#lightbox").addEventListener("touchstart", (event) => {
  touchStartX = event.changedTouches[0].clientX;
}, { passive: true });

$("#lightbox").addEventListener("touchend", (event) => {
  const delta = event.changedTouches[0].clientX - touchStartX;
  if (Math.abs(delta) > 60) changeLightbox(delta > 0 ? -1 : 1);
}, { passive: true });

$("#downloadSelectedBtn")?.addEventListener("click", downloadSelectedFiles);

$("#clearDownloadSelectionBtn")?.addEventListener("click", () => {
  downloadSelection.clear();
  render();
});



init();