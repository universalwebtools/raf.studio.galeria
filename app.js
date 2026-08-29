import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getDatabase, ref, get, set, remove } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";
import { getStorage, ref as sRef, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js";
import { firebaseConfig } from "./firebase-config.js?v=11";

const fb = initializeApp(firebaseConfig);
const auth = getAuth(fb);
const db = getDatabase(fb);
const storage = getStorage(fb);

const $ = (selector) => document.querySelector(selector);
const slug = new URLSearchParams(location.search).get("g") || "";

let uid = null;
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
  $("#lockScreen").hidden = true;
  $("#galleryView").hidden = false;
  $("#loading").hidden = false;

  await loadFavorites();
  loadManifest();
}

async function loadFavorites() {
  try {
    const snap = await get(ref(db, `galleries/${slug}/selections/${uid}`));
    favorites.clear();

    if (snap.exists()) {
      Object.values(snap.val() || {}).forEach(item => {
        if (item?.filename) favorites.set(item.filename, item);
      });
    }
  } catch (error) {
    console.error("LOAD FAVORITES ERROR", error);
    toast(`Nie udało się odczytać wyborów: ${error.code || error.message}`);
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

    const heart = document.createElement("button");
    heart.type = "button";
    heart.className = `photo-fav${selected ? " active" : ""}`;
    heart.textContent = selected ? "♥" : "♡";
    heart.setAttribute("aria-label", selected ? "Usuń z wybranych" : "Dodaj do wybranych");
    heart.setAttribute("aria-pressed", selected ? "true" : "false");

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

    card.append(skeleton, img, heart);
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
    const target = ref(db, `galleries/${slug}/selections/${uid}/${selectionKey(filename)}`);

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
    toast(`Błąd zapisu wyboru: ${error.code || error.message || error}`);
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
}

async function getOriginalUrl(index) {
  const photo = photos[index];
  if (!photo) return null;

  if (photo.originalUrl) return photo.originalUrl;

  try {
    photo.originalUrl = await getDownloadURL(sRef(storage, photo.originalPath));
  } catch (error) {
    console.warn("ORIGINAL URL ERROR", error);
    photo.originalUrl = photo.preview;
  }

  return photo.originalUrl;
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

  try {
    const enteredHash = await sha256($("#passwordInput").value);
    const ok = enteredHash === gallery.passwordHash;

    $("#passwordError").hidden = ok;

    if (!ok) return;

    sessionStorage.setItem(`raf-access-${slug}`, "1");
    await openGallery();
  } catch (error) {
    console.error("LOGIN ERROR", error);
    $("#passwordError").textContent = `Błąd logowania: ${error.message || error}`;
    $("#passwordError").hidden = false;
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

init();