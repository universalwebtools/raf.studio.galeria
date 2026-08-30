import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getDatabase, ref, get, set, remove, onValue } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";
import { getStorage, ref as sRef, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js";
import { firebaseConfig } from "./firebase-config.js?v=15.0";

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
let slideshowTimer = null;
let slideshowActive = false;
let galleryLoaded = false;
let rejected = new Set();
let compareSelection = [];
let unsubscribeFavorites = null;


const DEFAULT_UI_CONFIG = {
  desktopColumns: 4,
  tabletColumns: 3,
  mobileColumns: 2,
  gridGap: 10,
  cardRadius: 9,
  buttonSize: 40,
  buttonGap: 6,
  buttonBg: "#111114",
  heartColor: "#ff3b4d",
  compareColor: "#22c55e",
  downloadColor: "#1b7f46",
  filterBg: "#f3f3f0",
  filterText: "#111111",
  showFilenames: true,
  labels: {
    all: "Wszystkie",
    favorites: "Wybrane",
    portrait: "Pionowe",
    landscape: "Poziome",
    hidden: "Ukryte",
    compare: "A/B",
    slideshow: "Slideshow",
    share: "Udostępnij",
    exit: "Wyjdź",
    downloadFavorites: "Pobierz wybrane"
  }
};

let currentUiConfig = structuredClone(DEFAULT_UI_CONFIG);

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function getUiConfig() {
  const stored = gallery?.uiConfig || {};
  const labels = { ...DEFAULT_UI_CONFIG.labels, ...(stored.labels || {}) };
  return {
    ...DEFAULT_UI_CONFIG,
    ...stored,
    labels,
    desktopColumns: clampNumber(stored.desktopColumns, 2, 6, DEFAULT_UI_CONFIG.desktopColumns),
    tabletColumns: clampNumber(stored.tabletColumns, 2, 5, DEFAULT_UI_CONFIG.tabletColumns),
    mobileColumns: clampNumber(stored.mobileColumns, 1, 4, DEFAULT_UI_CONFIG.mobileColumns),
    gridGap: clampNumber(stored.gridGap, 2, 30, DEFAULT_UI_CONFIG.gridGap),
    cardRadius: clampNumber(stored.cardRadius, 0, 30, DEFAULT_UI_CONFIG.cardRadius),
    buttonSize: clampNumber(stored.buttonSize, 26, 64, DEFAULT_UI_CONFIG.buttonSize),
    buttonGap: clampNumber(stored.buttonGap, 0, 20, DEFAULT_UI_CONFIG.buttonGap),
    showFilenames: stored.showFilenames !== false
  };
}

function applyUiConfig() {
  currentUiConfig = getUiConfig();
  const root = document.documentElement;
  root.style.setProperty("--gallery-cols-desktop", currentUiConfig.desktopColumns);
  root.style.setProperty("--gallery-cols-tablet", currentUiConfig.tabletColumns);
  root.style.setProperty("--gallery-cols-mobile", currentUiConfig.mobileColumns);
  root.style.setProperty("--gallery-gap", `${currentUiConfig.gridGap}px`);
  root.style.setProperty("--gallery-card-radius", `${currentUiConfig.cardRadius}px`);
  root.style.setProperty("--gallery-button-size", `${currentUiConfig.buttonSize}px`);
  root.style.setProperty("--gallery-button-gap", `${currentUiConfig.buttonGap}px`);
  root.style.setProperty("--gallery-button-bg", currentUiConfig.buttonBg || DEFAULT_UI_CONFIG.buttonBg);
  root.style.setProperty("--gallery-heart-color", currentUiConfig.heartColor || DEFAULT_UI_CONFIG.heartColor);
  root.style.setProperty("--gallery-compare-color", currentUiConfig.compareColor || DEFAULT_UI_CONFIG.compareColor);
  root.style.setProperty("--gallery-download-color", currentUiConfig.downloadColor || DEFAULT_UI_CONFIG.downloadColor);
  root.style.setProperty("--gallery-filter-bg", currentUiConfig.filterBg || DEFAULT_UI_CONFIG.filterBg);
  root.style.setProperty("--gallery-filter-text", currentUiConfig.filterText || DEFAULT_UI_CONFIG.filterText);

  const labels = currentUiConfig.labels;
  const labelMap = {
    allFilter: labels.all,
    favFilter: labels.favorites,
    portraitFilter: labels.portrait,
    landscapeFilter: labels.landscape,
    hiddenFilter: labels.hidden,
    favoritesToggleLabel: labels.favorites,
    slideshowLabel: labels.slideshow,
    shareLabel: labels.share,
    exitLabel: labels.exit,
    downloadFavoritesLabel: labels.downloadFavorites
  };
  Object.entries(labelMap).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el && value) el.textContent = value;
  });
}

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function normalizePassword(value) {
  return String(value ?? "").trim();
}

function displayName(filename) {
  return String(filename || "").replace(/\.(jpe?g|png|webp)$/i, "");
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


function formatDate(dateString) {
  if (!dateString) return "";
  const date = new Date(`${dateString}T12:00:00`);
  return date.toLocaleDateString("pl-PL");
}

function daysLeft(dateString) {
  if (!dateString) return null;
  const target = new Date(`${dateString}T23:59:59`);
  const diff = Math.ceil((target - new Date()) / 86400000);
  return diff;
}

function storageKeyRejected() {
  return `raf-rejected-${slug}`;
}

function loadRejectedState() {
  try {
    const raw = localStorage.getItem(storageKeyRejected());
    rejected = new Set(JSON.parse(raw || "[]"));
  } catch (_) {
    rejected = new Set();
  }
}

function saveRejectedState() {
  localStorage.setItem(storageKeyRejected(), JSON.stringify([...rejected]));
}

function detectOrientation(width, height) {
  if (!width || !height) return "";
  if (height > width) return "portrait";
  if (width > height) return "landscape";
  return "square";
}

function warmupOrientation(photo) {
  if (!photo || photo.orientation || photo._orientationPromise) return;
  photo._orientationPromise = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      photo.width = img.naturalWidth;
      photo.height = img.naturalHeight;
      photo.orientation = detectOrientation(img.naturalWidth, img.naturalHeight);
      resolve();
      if (["portrait", "landscape"].includes(filter)) render();
    };
    img.onerror = () => resolve();
    img.src = photo.preview;
  });
}

function filteredPhotos() {
  switch (filter) {
    case "favorites":
      return photos.filter(photo => favorites.has(photo.filename) && !rejected.has(photo.filename));
    case "portrait":
      return photos.filter(photo => photo.orientation === "portrait" && !rejected.has(photo.filename));
    case "landscape":
      return photos.filter(photo => photo.orientation === "landscape" && !rejected.has(photo.filename));
    case "hidden":
      return photos.filter(photo => rejected.has(photo.filename));
    default:
      return photos.filter(photo => !rejected.has(photo.filename));
  }
}

function visiblePhotos() {
  return filteredPhotos();
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

    applyUiConfig();
    applyGalleryMeta();

    loadRejectedState();

    if (sessionStorage.getItem(`raf-access-${slug}`) === "1") {
      showIntro();
    }
  } catch (error) {
    console.error("INIT ERROR", error);
    showFatal(`Nie udało się uruchomić galerii: ${error.code || error.message || error}`);
  }
}

function applyGalleryMeta() {
  const title = gallery.title || "Galeria klienta";
  const subtitle = gallery.subtitle || "Wybierz ulubione zdjęcia.";
  const photoCount = Number(gallery.photoCount || Object.keys(gallery.photos || {}).length || 0);

  $("#lockTitle").textContent = title;
  $("#heroTitle").textContent = title;
  $("#heroSubtitle").textContent = subtitle;
  $("#introTitle").textContent = title;
  $("#introSubtitle").textContent = gallery.introMessage || subtitle || "Twoje zdjęcia są gotowe do obejrzenia.";
  $("#introPhotoCount").textContent = `${photoCount} zdjęć`;

  if (gallery.eventDate) {
    $("#introDate").textContent = formatDate(gallery.eventDate);
    $("#introDate").hidden = false;
  } else {
    $("#introDate").hidden = true;
  }

  if (gallery.expiresAt) {
    const left = daysLeft(gallery.expiresAt);
    const suffix = left === null ? "" : left < 0 ? "" : left === 0 ? " • wygasa dziś" : left === 1 ? " • jeszcze 1 dzień" : ` • jeszcze ${left} dni`;
    const expiryText = `Dostęp do ${formatDate(gallery.expiresAt)}${suffix}`;
    $("#expiryLabel").textContent = expiryText;
    $("#introExpiry").textContent = expiryText;
    $("#introExpiry").hidden = false;
  } else {
    $("#expiryLabel").textContent = "";
    $("#introExpiry").hidden = true;
  }

  const footerThanks = $("#footerThanks");
  const footerOutro = $("#footerOutro");
  if (footerThanks) footerThanks.textContent = "Dziękuję za wspólnie spędzony czas ❤️";
  if (footerOutro) footerOutro.textContent = gallery.outroMessage || "Mam nadzieję, że ta galeria będzie piękną pamiątką.";

  const instagram = $("#footerInstagram");
  const website = $("#footerWebsite");
  if (instagram) {
    if (gallery.instagram) {
      instagram.href = gallery.instagram;
      instagram.hidden = false;
    } else instagram.hidden = true;
  }
  if (website) {
    if (gallery.website) {
      website.href = gallery.website;
      website.hidden = false;
    } else website.hidden = true;
  }

  if (maxFavorites() > 0) {
    $("#maxFavoritesLabel").textContent = ` z ${maxFavorites()}`;
    $("#progressWrap").hidden = false;
  } else {
    $("#maxFavoritesLabel").textContent = "";
    $("#progressWrap").hidden = true;
  }

  const manifest = Object.values(gallery.photos || {});
  const coverItem = manifest.find(item => item?.filename === gallery.coverFile && item?.previewUrl) || manifest[0];
  if (coverItem?.previewUrl) {
    $("#introBackdrop").style.backgroundImage = `url("${coverItem.previewUrl}")`;
    $("#introBackdrop").style.backgroundPosition = `${Number(gallery.coverPositionX ?? 50)}% ${Number(gallery.coverPositionY ?? 38)}%`;
  }
}


function showIntro() {
  $("#lockScreen").hidden = true;
  $("#introScreen").hidden = false;
  $("#galleryView").hidden = true;
}

async function openGallery() {
  $("#lockScreen").hidden = true;
  $("#introScreen").hidden = true;
  $("#galleryView").hidden = false;

  if (!galleryLoaded) {
    galleryLoaded = true;
    $("#loading").hidden = false;
    loadManifest();

    loadFavorites()
      .then(() => {
        render();
        updateUI();
        watchFavorites();
      })
      .catch(error => {
        console.error("BACKGROUND FAVORITES ERROR", error);
      });
  } else {
    render();
    updateUI();
  }
}


function normalizedSharedFavorites(raw) {
  const currentByExact = new Map(photos.map(photo => [String(photo.filename), photo.filename]));
  const currentByBase = new Map(photos.map(photo => [displayName(photo.filename).toLowerCase(), photo.filename]));
  const normalized = new Map();

  Object.values(raw || {}).forEach(item => {
    if (!item?.filename) return;

    const canonical = currentByExact.get(String(item.filename)) ||
      currentByBase.get(displayName(item.filename).toLowerCase());

    if (!canonical) return; // old/deleted photo: do not count it

    const key = displayName(canonical).toLowerCase();
    const candidate = { ...item, filename: canonical };
    const existing = normalized.get(key);

    if (!existing || Number(candidate.selectedAt || 0) < Number(existing.selectedAt || 0)) {
      normalized.set(key, candidate);
    }
  });

  let items = [...normalized.values()].sort((a, b) => {
    const timeDiff = Number(a.selectedAt || 0) - Number(b.selectedAt || 0);
    if (timeDiff) return timeDiff;
    return displayName(a.filename).localeCompare(displayName(b.filename), undefined, { numeric: true });
  });

  const max = maxFavorites();
  const hardLimit = max > 0 ? Math.min(max, photos.length) : photos.length;
  items = items.slice(0, hardLimit);

  return new Map(items.map(item => [item.filename, item]));
}

async function loadFavorites() {
  try {
    const snap = await get(ref(db, `selections/${slug}`));
    favorites = normalizedSharedFavorites(snap.exists() ? snap.val() : {});
  } catch (error) {
    console.error("LOAD FAVORITES ERROR", error);
  }
}

function watchFavorites() {
  if (unsubscribeFavorites) unsubscribeFavorites();
  unsubscribeFavorites = onValue(
    ref(db, `selections/${slug}`),
    (snapshot) => {
      favorites = normalizedSharedFavorites(snapshot.exists() ? snapshot.val() : {});
      if (galleryLoaded) {
        render();
        updateUI();
      }
    },
    (error) => console.error("FAVORITES WATCH ERROR", error)
  );
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
      originalUrl: null,
      width: Number(item.width || 0),
      height: Number(item.height || 0),
      orientation: item.orientation || detectOrientation(Number(item.width || 0), Number(item.height || 0))
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
  if (cover) {
    $("#hero").style.backgroundImage = `url("${cover.preview}")`;
    $("#hero").style.backgroundPosition = `${Number(gallery.coverPositionX ?? 50)}% ${Number(gallery.coverPositionY ?? 38)}%`;
  }

  photos.forEach(warmupOrientation);

  render();
}

function render() {
  const list = filteredPhotos();

  const grid = $("#grid");
  grid.innerHTML = "";

  if (!list.length) {
    const empty = filter === "favorites"
      ? "Nie zaznaczono jeszcze żadnych zdjęć."
      : filter === "portrait" ? "Brak pionowych zdjęć."
      : filter === "landscape" ? "Brak poziomych zdjęć."
      : filter === "hidden" ? "Nie ukryto żadnych zdjęć."
      : "";
    grid.innerHTML = empty ? `<div class="notice">${empty}</div>` : "";
    updateUI();
    return;
  }

  list.forEach(photo => {
    const index = photos.findIndex(p => p.filename === photo.filename);
    const selected = favorites.has(photo.filename);
    const isRejected = rejected.has(photo.filename);
    const isCompared = compareSelection.includes(photo.filename);

    const card = document.createElement("article");
    card.className = `photo-card${selected ? " fav-active" : ""}${isRejected ? " rejected" : ""}${isCompared ? " compare-active" : ""}`;

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

    const rejectBtn = document.createElement("button");
    rejectBtn.type = "button";
    rejectBtn.className = `photo-reject${isRejected ? " active" : ""}`;
    rejectBtn.textContent = "×";
    rejectBtn.title = isRejected ? "Przywróć zdjęcie" : "Ukryj / odrzuć zdjęcie";

    const compareBtn = document.createElement("button");
    compareBtn.type = "button";
    compareBtn.className = `photo-compare${isCompared ? " active" : ""}`;
    compareBtn.textContent = currentUiConfig.labels.compare || "A/B";
    compareBtn.title = "Dodaj do porównania";

    const downloadOne = document.createElement("button");
    downloadOne.type = "button";
    downloadOne.className = "photo-download";
    downloadOne.textContent = "↓";
    downloadOne.title = "Pobierz to zdjęcie";

    const selectDownload = document.createElement("button");
    selectDownload.type = "button";
    selectDownload.className = `photo-select-download${downloadSelection.has(photo.filename) ? " active" : ""}`;
    selectDownload.textContent = downloadSelection.has(photo.filename) ? "✓" : "○";
    selectDownload.title = "Zaznacz do pobrania";

    const filename = document.createElement("div");
    filename.className = "photo-filename";
    filename.textContent = displayName(photo.filename);
    filename.hidden = currentUiConfig.showFilenames === false;

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

    rejectBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleRejected(photo.filename);
    });

    compareBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleCompareSelection(photo.filename);
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

    tools.append(heart, rejectBtn, compareBtn, downloadOne, selectDownload);
    card.append(skeleton, img, tools, filename);
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
    const target = ref(db, `selections/${slug}/${selectionKey(filename)}`);

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
      toast("Brak uprawnień Firebase — wklej database-rules.json z v15 i kliknij Publish.");
    }else{
      toast(`Błąd zapisu wyboru: ${error.code || error.message || error}`);
    }
  }
}

function toggleRejected(filename) {
  if (rejected.has(filename)) {
    rejected.delete(filename);
    toast("Przywrócono zdjęcie");
  } else {
    rejected.add(filename);
    downloadSelection.delete(filename);
    compareSelection = compareSelection.filter(name => name !== filename);
    toast("Ukryto zdjęcie");
  }
  saveRejectedState();
  render();
}

function toggleCompareSelection(filename) {
  if (compareSelection.includes(filename)) {
    compareSelection = compareSelection.filter(name => name !== filename);
  } else if (compareSelection.length >= 2) {
    toast("Do porównania wybierz maksymalnie 2 zdjęcia.");
    return;
  } else {
    compareSelection.push(filename);
  }
  render();
}

function clearCompareSelection() {
  compareSelection = [];
  updateCompareUI();
  render();
}

async function openCompareDialog() {
  if (compareSelection.length !== 2) {
    toast("Wybierz dokładnie 2 zdjęcia do porównania.");
    return;
  }
  const [nameA, nameB] = compareSelection;
  const indexA = photos.findIndex(photo => photo.filename === nameA);
  const indexB = photos.findIndex(photo => photo.filename === nameB);
  const photoA = photos[indexA];
  const photoB = photos[indexB];
  if (!photoA || !photoB) return;

  $("#compareCaptionA").textContent = displayName(photoA.filename);
  $("#compareCaptionB").textContent = displayName(photoB.filename);
  $("#compareImageA").src = photoA.preview;
  $("#compareImageB").src = photoB.preview;
  $("#compareDialog").hidden = false;
  document.body.style.overflow = "hidden";

  try {
    const [urlA, urlB] = await Promise.all([getOriginalUrl(indexA), getOriginalUrl(indexB)]);
    if (urlA) $("#compareImageA").src = urlA;
    if (urlB) $("#compareImageB").src = urlB;
  } catch (_) {}
}

function closeCompareDialog() {
  $("#compareDialog").hidden = true;
  document.body.style.overflow = "";
}

function swapCompareSelection() {
  if (compareSelection.length === 2) {
    compareSelection = [compareSelection[1], compareSelection[0]];
    openCompareDialog();
    updateCompareUI();
  }
}

function updateCompareUI() {
  const bar = $("#compareBar");
  const count = compareSelection.length;
  if (!bar) return;

  $("#compareSelectedCount").textContent = count;
  $("#compareSelectedNames").textContent = count ? compareSelection.map(displayName).join("  •  ") : "Wybierz dwa zdjęcia do porównania obok siebie";
  bar.hidden = count === 0;
  document.body.classList.toggle("compare-bar-visible", count > 0);
  const openButton = $("#openCompareBtn");
  openButton.disabled = count !== 2;
  openButton.textContent = count === 2 ? `↔ Porównaj (${currentUiConfig.labels.compare || "A/B"})` : `↔ ${currentUiConfig.labels.compare || "A/B"}`;
}

function setFilter(next) {
  filter = next;
  ["all", "favorites", "portrait", "landscape", "hidden"].forEach(name => {
    const button = document.getElementById(`${name === "favorites" ? "fav" : name}Filter`) || document.getElementById(`${name}Filter`);
    if (button) button.classList.toggle("active", filter === name);
  });
  render();
}

function updateUI() {
  const count = favorites.size;

  $("#favCount").textContent = count;
  $("#selectedCount").textContent = count;

  if (maxFavorites() > 0) {
    const percent = Math.min(100, (count / maxFavorites()) * 100);
    $("#selectProgress").style.width = `${percent}%`;
    $("#progressText").textContent = `Wybrano ${count} z ${maxFavorites()} zdjęć`;
  }

  const inlineHeartDownload = $("#downloadFavoritesInlineBtn");
  if (inlineHeartDownload) {
    inlineHeartDownload.hidden = count === 0;
    inlineHeartDownload.textContent = `♥ Pobierz wybrane (${count})`;
  }

  updateDownloadUI();
  updateCompareUI();
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


function updateSlideshowButtons() {
  const slideshowName = currentUiConfig.labels.slideshow || "Slideshow";
  const topButton = $("#slideshowBtn");
  const lbButton = $("#lightboxSlideshow");
  if (topButton) topButton.innerHTML = slideshowActive ? "❚❚ Stop" : `▶ <span id="slideshowLabel">${slideshowName}</span>`;
  if (lbButton) lbButton.textContent = slideshowActive ? "❚❚" : "▶";
}

function stopSlideshow() {
  slideshowActive = false;
  if (slideshowTimer) {
    clearInterval(slideshowTimer);
    slideshowTimer = null;
  }
  updateSlideshowButtons();
}

async function startSlideshow(index = 0) {
  if (!photos.length) return;
  await openLightbox(index);
  slideshowActive = true;
  updateSlideshowButtons();
  if (document.fullscreenElement == null && document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen().catch(() => {});
  }
  if (slideshowTimer) clearInterval(slideshowTimer);
  slideshowTimer = setInterval(() => changeLightbox(1), 3200);
}

function toggleSlideshow(index = currentIndex) {
  if (slideshowActive) stopSlideshow();
  else startSlideshow(index);
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
    if (!url) throw new Error("Brak pliku.");

    startAttachmentDownload(url, photo.filename);

    if (photo.downloadSource === "preview") {
      toast("Oryginału brak — pobieram wersję podglądową.");
    }
  } catch (error) {
    console.error("SINGLE DOWNLOAD ERROR", error);
    toast(`Nie udało się pobrać: ${error.message || error}`);
  }
}

async function downloadFavoriteFiles() {
  if (gallery.downloadsEnabled === false) {
    toast("Pobieranie zdjęć jest wyłączone dla tej galerii.");
    return;
  }
  const selected = photos.filter(photo => favorites.has(photo.filename));
  if (!selected.length) {
    toast("Najpierw zaznacz zdjęcia serduszkiem ♥.");
    return;
  }
  const button = $("#downloadFavoritesBtn");
  const inlineButton = $("#downloadFavoritesInlineBtn");
  if (button) button.disabled = true;
  if (inlineButton) inlineButton.disabled = true;
  try {
    for (let i = 0; i < selected.length; i++) {
      const photo = selected[i];
      const index = photos.findIndex(p => p.filename === photo.filename);
      if (button) button.textContent = `♥↓ ${i + 1}/${selected.length}`;
      if (inlineButton) inlineButton.textContent = `Pobieram ${i + 1}/${selected.length}…`;
      const url = await getOriginalUrl(index);
      if (url) startAttachmentDownload(url, photo.filename);
      await new Promise(resolve => setTimeout(resolve, 1100));
    }
    toast(`Uruchomiono pobieranie ${selected.length} wybranych zdjęć.`);
  } catch (error) {
    console.error("FAVORITES DOWNLOAD ERROR", error);
    toast(`Błąd pobierania: ${error.message || error}`);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "♥↓ Pobierz wybrane";
    }
    if (inlineButton) {
      inlineButton.disabled = false;
      inlineButton.textContent = `♥ ${currentUiConfig.labels.downloadFavorites || "Pobierz wybrane"} (${favorites.size})`;
    }
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

  const candidates = [];

  // 1) exact path stored in manifest
  if (photo.originalPath) {
    candidates.push(photo.originalPath);
  }

  // 2) canonical originals path
  candidates.push(`galleries/${slug}/originals/${photo.filename}`);

  for (const path of [...new Set(candidates)]) {
    try {
      photo.originalUrl = await getDownloadURL(sRef(storage, path));
      photo.downloadSource = "original";
      return photo.originalUrl;
    } catch (_) {}
  }

  // 3) last resort: preview — better than failing completely.
  if (photo.preview) {
    photo.originalUrl = photo.preview;
    photo.downloadSource = "preview";
    return photo.originalUrl;
  }

  throw new Error(`Nie znaleziono pliku ${photo.filename}`);
}

async function openLightbox(index) {
  currentIndex = index;
  const photo = photos[index];

  $("#lightbox").hidden = false;
  document.body.style.overflow = "hidden";
  $("#lightboxImage").src = photo.preview;

  updateLightboxUI();
  updateSlideshowButtons();

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

  $("#lightboxCaption").textContent = `${currentIndex + 1} / ${photos.length} · ${displayName(photo.filename)}`;
  $("#lightboxFav").textContent = selected ? "♥" : "♡";
  $("#lightboxFav").classList.toggle("active", selected);
  $("#lightboxReject").classList.toggle("active", rejected.has(photo.filename));
  $("#lightboxDownload").hidden = gallery.downloadsEnabled === false;
  updateSlideshowButtons();

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
  stopSlideshow();
  $("#lightbox").hidden = true;
  document.body.style.overflow = "";
  if (document.fullscreenElement && document.exitFullscreen) {
    document.exitFullscreen().catch(() => {});
  }
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
    showIntro();
  } catch (error) {
    console.error("LOGIN ERROR", error);
    errorEl.textContent = `Błąd logowania: ${error.code || error.message || error}`;
    errorEl.hidden = false;
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Otwórz galerię";
  }
});

$("#allFilter").addEventListener("click", () => setFilter("all"));
$("#favFilter").addEventListener("click", () => setFilter("favorites"));
$("#portraitFilter").addEventListener("click", () => setFilter("portrait"));
$("#landscapeFilter").addEventListener("click", () => setFilter("landscape"));
$("#hiddenFilter").addEventListener("click", () => setFilter("hidden"));

$("#favoritesToggle").addEventListener("click", () => setFilter("favorites"));
$("#downloadFavoritesBtn")?.addEventListener("click", downloadFavoriteFiles);
$("#downloadFavoritesInlineBtn")?.addEventListener("click", downloadFavoriteFiles);
$("#startGalleryBtn").addEventListener("click", openGallery);

$("#slideshowBtn")?.addEventListener("click", () => {
  const list = visiblePhotos();
  if (!list.length) return;
  const firstVisible = list[0];
  const index = photos.findIndex(photo => photo.filename === firstVisible.filename);
  toggleSlideshow(Math.max(0, index));
});

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

$("#lightboxReject")?.addEventListener("click", () => {
  const photo = photos[currentIndex];
  if (!photo) return;
  toggleRejected(photo.filename);
  updateLightboxUI();
});

$("#lightboxSlideshow")?.addEventListener("click", () => toggleSlideshow(currentIndex));

$("#lightboxDownload").addEventListener("click", async (event) => {
  event.preventDefault();
  await downloadSinglePhoto(currentIndex);
});

document.addEventListener("keydown", (event) => {
  if (!$("#compareDialog").hidden && event.key === "Escape") closeCompareDialog();
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

$("#openCompareBtn")?.addEventListener("click", openCompareDialog);
$("#clearCompareSelectionBtn")?.addEventListener("click", clearCompareSelection);
$("#closeCompareDialog")?.addEventListener("click", closeCompareDialog);
$("#swapCompareBtn")?.addEventListener("click", swapCompareSelection);
$("#compareDialog")?.addEventListener("click", (event) => {
  if (event.target.id === "compareDialog") closeCompareDialog();
});

init();