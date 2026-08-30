import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getDatabase, ref, get, set, remove, onValue, push } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";
import { getStorage, ref as sRef, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js";
import { firebaseConfig } from "./firebase-config.js?v=16.2";

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
let latestApproval = null;

const CLIENT_LOGIN_CONFIG_PATH = "galleries/__system__/public/clientLoginConfig";

const DEFAULT_CLIENT_LOGIN_CONFIG = {
  eyebrow: "PRYWATNA GALERIA",
  instruction: "Wpisz hasło otrzymane od fotografa.",
  passwordPlaceholder: "Hasło do galerii",
  buttonLabel: "Otwórz galerię",

  logoWidth: 190,
  cardWidth: 460,
  cardRadius: 26,
  cardPadding: 42,
  titleSize: 44,
  formGap: 12,

  bgTop: "#29292e",
  bgMiddle: "#111113",
  bgBottom: "#09090a",
  cardBg: "#111113",
  cardBorder: "#2e2e33",
  textColor: "#f4f4f2",
  mutedColor: "#929298",
  buttonBg: "#f5f5f2",
  buttonText: "#0b0b0c",
  inputBg: "#0e0e10",
  inputBorder: "#34343a",
  accentColor: "#aaaaaa",

  showLogo: true,
  showEyebrow: true,
  showInstruction: true
};

let clientLoginConfig = { ...DEFAULT_CLIENT_LOGIN_CONFIG };

function clampClientValue(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function normalizeClientLoginConfig(raw) {
  const stored = raw || {};
  return {
    ...DEFAULT_CLIENT_LOGIN_CONFIG,
    ...stored,
    logoWidth: clampClientValue(stored.logoWidth, 80, 360, DEFAULT_CLIENT_LOGIN_CONFIG.logoWidth),
    cardWidth: clampClientValue(stored.cardWidth, 300, 720, DEFAULT_CLIENT_LOGIN_CONFIG.cardWidth),
    cardRadius: clampClientValue(stored.cardRadius, 0, 60, DEFAULT_CLIENT_LOGIN_CONFIG.cardRadius),
    cardPadding: clampClientValue(stored.cardPadding, 18, 80, DEFAULT_CLIENT_LOGIN_CONFIG.cardPadding),
    titleSize: clampClientValue(stored.titleSize, 28, 72, DEFAULT_CLIENT_LOGIN_CONFIG.titleSize),
    formGap: clampClientValue(stored.formGap, 6, 28, DEFAULT_CLIENT_LOGIN_CONFIG.formGap),
    showLogo: stored.showLogo !== false,
    showEyebrow: stored.showEyebrow !== false,
    showInstruction: stored.showInstruction !== false
  };
}

function applyClientLoginConfig(config = clientLoginConfig) {
  clientLoginConfig = normalizeClientLoginConfig(config);

  const screen = $("#lockScreen");
  const card = $("#lockScreen .lock-card");
  const logo = $("#clientLoginLogo");
  const eyebrow = $("#clientLoginEyebrow");
  const instruction = $("#clientLoginInstruction");
  const password = $("#passwordInput");
  const submit = $("#clientLoginSubmit");

  if (screen) {
    screen.style.setProperty("--client-login-bg-top", clientLoginConfig.bgTop);
    screen.style.setProperty("--client-login-bg-middle", clientLoginConfig.bgMiddle);
    screen.style.setProperty("--client-login-bg-bottom", clientLoginConfig.bgBottom);
    screen.style.setProperty("--client-login-text", clientLoginConfig.textColor);
    screen.style.setProperty("--client-login-muted", clientLoginConfig.mutedColor);
    screen.style.setProperty("--client-login-accent", clientLoginConfig.accentColor);
    screen.style.setProperty("--client-login-logo-width", `${clientLoginConfig.logoWidth}px`);
  }

  if (card) {
    card.style.setProperty("--client-login-card-width", `${clientLoginConfig.cardWidth}px`);
    card.style.setProperty("--client-login-card-radius", `${clientLoginConfig.cardRadius}px`);
    card.style.setProperty("--client-login-card-padding", `${clientLoginConfig.cardPadding}px`);
    card.style.setProperty("--client-login-card-bg", clientLoginConfig.cardBg);
    card.style.setProperty("--client-login-card-border", clientLoginConfig.cardBorder);
    card.style.setProperty("--client-login-title-size", `${clientLoginConfig.titleSize}px`);
    card.style.setProperty("--client-login-form-gap", `${clientLoginConfig.formGap}px`);
    card.style.setProperty("--client-login-button-bg", clientLoginConfig.buttonBg);
    card.style.setProperty("--client-login-button-text", clientLoginConfig.buttonText);
    card.style.setProperty("--client-login-input-bg", clientLoginConfig.inputBg);
    card.style.setProperty("--client-login-input-border", clientLoginConfig.inputBorder);
  }

  if (logo) {
    logo.style.width = `${clientLoginConfig.logoWidth}px`;
    logo.style.maxWidth = "82%";
    logo.hidden = !clientLoginConfig.showLogo;
  }

  if (eyebrow) {
    eyebrow.textContent = clientLoginConfig.eyebrow || "";
    eyebrow.hidden = !clientLoginConfig.showEyebrow;
  }

  if (instruction) {
    instruction.textContent = clientLoginConfig.instruction || "";
    instruction.hidden = !clientLoginConfig.showInstruction;
  }

  if (password) password.placeholder = clientLoginConfig.passwordPlaceholder || "Hasło do galerii";
  if (submit) submit.textContent = clientLoginConfig.buttonLabel || "Otwórz galerię";
}

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
  showHeartButton: true,
  showRejectButton: true,
  showCompareButton: true,
  showSingleDownloadButton: true,
  showDownloadSelectButton: true,
  allowSingleDownload: true,
  allowSelectedDownloads: true,
  allowFavoriteDownloads: true,
  blockSaveImage: true,
  // HERO Designer v16.2
  heroMode: "cover", // legacy compatibility
  heroLayout: "trio",
  heroFit: "cover",
  heroHeightDesktop: 360,
  heroHeightTablet: 320,
  heroHeightMobile: 300,
  heroMaxWidth: 1600,
  heroTileGap: 6,
  heroTileRadius: 10,
  heroOverlay: 46,
  heroImageWidth: 1500, // legacy compatibility
  heroBgColor: "#09090a",
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
    showFilenames: stored.showFilenames !== false,
    showHeartButton: stored.showHeartButton !== false,
    showRejectButton: stored.showRejectButton !== false,
    showCompareButton: stored.showCompareButton !== false,
    showSingleDownloadButton: stored.showSingleDownloadButton !== false,
    showDownloadSelectButton: stored.showDownloadSelectButton !== false,
    allowSingleDownload: stored.allowSingleDownload !== false,
    allowSelectedDownloads: stored.allowSelectedDownloads !== false,
    allowFavoriteDownloads: stored.allowFavoriteDownloads !== false,
    blockSaveImage: stored.blockSaveImage !== false,
    heroMode: ["cover","fixed","contain","none"].includes(stored.heroMode) ? stored.heroMode : DEFAULT_UI_CONFIG.heroMode,
    heroLayout: ["single","duo","trio","mosaic4","none"].includes(stored.heroLayout)
      ? stored.heroLayout
      : (stored.heroMode === "none" ? "none" : DEFAULT_UI_CONFIG.heroLayout),
    heroFit: ["cover","contain"].includes(stored.heroFit) ? stored.heroFit : DEFAULT_UI_CONFIG.heroFit,
    heroHeightDesktop: clampNumber(stored.heroHeightDesktop, 200, 700, DEFAULT_UI_CONFIG.heroHeightDesktop),
    heroHeightTablet: clampNumber(stored.heroHeightTablet, 180, 600, DEFAULT_UI_CONFIG.heroHeightTablet),
    heroHeightMobile: clampNumber(stored.heroHeightMobile, 180, 520, DEFAULT_UI_CONFIG.heroHeightMobile),
    heroMaxWidth: clampNumber(stored.heroMaxWidth, 800, 2400, DEFAULT_UI_CONFIG.heroMaxWidth),
    heroTileGap: clampNumber(stored.heroTileGap, 0, 24, DEFAULT_UI_CONFIG.heroTileGap),
    heroTileRadius: clampNumber(stored.heroTileRadius, 0, 30, DEFAULT_UI_CONFIG.heroTileRadius),
    heroOverlay: clampNumber(stored.heroOverlay, 0, 85, DEFAULT_UI_CONFIG.heroOverlay),
    heroImageWidth: clampNumber(stored.heroImageWidth, 600, 2600, DEFAULT_UI_CONFIG.heroImageWidth),
    heroBgColor: stored.heroBgColor || DEFAULT_UI_CONFIG.heroBgColor
  };
}

function masterDownloadsEnabled() { return gallery?.downloadsEnabled !== false; }
function canDownloadSingle() { return masterDownloadsEnabled() && currentUiConfig.allowSingleDownload !== false; }
function canDownloadSelected() { return masterDownloadsEnabled() && currentUiConfig.allowSelectedDownloads !== false; }
function canDownloadFavorites() { return masterDownloadsEnabled() && currentUiConfig.allowFavoriteDownloads !== false; }

function applyFeatureVisibility() {
  const hearts = currentUiConfig.showHeartButton !== false;
  const reject = currentUiConfig.showRejectButton !== false;
  const compare = currentUiConfig.showCompareButton !== false;

  const favoritesToggle = $("#favoritesToggle");
  const favFilter = $("#favFilter");
  const selectionCount = document.querySelector(".selection-count");
  if (favoritesToggle) favoritesToggle.hidden = !hearts;
  if (favFilter) favFilter.hidden = !hearts;
  if (selectionCount) selectionCount.hidden = !hearts;
  if ($("#hiddenFilter")) $("#hiddenFilter").hidden = !reject;

  const downloadFavoritesBtn = $("#downloadFavoritesBtn");
  if (downloadFavoritesBtn) downloadFavoritesBtn.hidden = !hearts || !canDownloadFavorites();

  if (!compare) {
    compareSelection = [];
    if ($("#compareBar")) $("#compareBar").hidden = true;
    document.body.classList.remove("compare-bar-visible");
  }

  if (!hearts && filter === "favorites") filter = "all";
  if (!reject && filter === "hidden") filter = "all";
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
  root.style.setProperty("--hero-height-desktop", `${currentUiConfig.heroHeightDesktop}px`);
  root.style.setProperty("--hero-height-tablet", `${currentUiConfig.heroHeightTablet}px`);
  root.style.setProperty("--hero-height-mobile", `${currentUiConfig.heroHeightMobile}px`);
  root.style.setProperty("--hero-max-width", `${currentUiConfig.heroMaxWidth}px`);
  root.style.setProperty("--hero-tile-gap", `${currentUiConfig.heroTileGap}px`);
  root.style.setProperty("--hero-tile-radius", `${currentUiConfig.heroTileRadius}px`);
  root.style.setProperty("--hero-fit", currentUiConfig.heroFit || "cover");
  root.style.setProperty("--hero-overlay-opacity", `${currentUiConfig.heroOverlay / 100}`);
  root.style.setProperty("--hero-image-width", `${currentUiConfig.heroImageWidth}px`);
  root.style.setProperty("--hero-bg-color", currentUiConfig.heroBgColor || DEFAULT_UI_CONFIG.heroBgColor);
  const hero = $("#hero");
  if (hero) {
    hero.dataset.heroMode = currentUiConfig.heroMode || "cover";
    hero.dataset.heroLayout = currentUiConfig.heroLayout || "trio";
  }

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
  applyFeatureVisibility();
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
  applyClientLoginConfig(DEFAULT_CLIENT_LOGIN_CONFIG);
  if (!slug) {
    showFatal("Brak identyfikatora galerii w linku.");
    return;
  }

  try {
    const credential = await signInAnonymously(auth);
    uid = credential.user.uid;

    const [clientLoginConfigSnap, publicSnap] = await Promise.all([
      get(ref(db, CLIENT_LOGIN_CONFIG_PATH)).catch(() => null),
      get(ref(db, `galleries/${slug}/public`))
    ]);

    if (clientLoginConfigSnap?.exists?.()) {
      clientLoginConfig = normalizeClientLoginConfig(clientLoginConfigSnap.val());
      applyClientLoginConfig(clientLoginConfig);
    }

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
  const photoCount = Object.values(gallery.photos || {}).filter(item => item?.filename && item?.previewUrl && item.hiddenFromClient !== true).length;

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

  const manifest = Object.values(gallery.photos || {}).filter(item => item?.hiddenFromClient !== true);
  const heroFile = gallery.heroBackgroundFile || gallery.coverFile;
  const coverItem = manifest.find(item => item?.filename === heroFile && item?.previewUrl) || manifest[0];
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


async function loadLatestApproval() {
  try {
    const snap = await get(ref(db, `approvals/${slug}`));
    if (!snap.exists()) {
      latestApproval = null;
      updateApprovalStatus();
      return;
    }
    const rows = Object.values(snap.val() || {}).filter(row => row?.submittedAt).sort((a,b) => Number(b.submittedAt) - Number(a.submittedAt));
    latestApproval = rows[0] || null;
    updateApprovalStatus();
  } catch (error) {
    console.warn("LOAD APPROVAL ERROR", error);
  }
}

function formatApprovalDate(timestamp) {
  if (!timestamp) return "";
  return new Date(Number(timestamp)).toLocaleString("pl-PL", {
    weekday: "long", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"
  });
}

function updateApprovalStatus() {
  const status = $("#selectionApprovalStatus");
  if (!status) return;
  if (!latestApproval) {
    status.textContent = "Możesz w każdej chwili wyczyścić serduszka i zacząć od nowa.";
    return;
  }
  status.textContent = `Ostatnio zatwierdzono ${latestApproval.selectedCount || 0} zdjęć • ${formatApprovalDate(latestApproval.submittedAt)}. Jeśli zmienisz wybór, zatwierdź ponownie.`;
}

async function clearAllFavorites() {
  if (!favorites.size) {
    toast("Nie ma serduszek do wyczyszczenia.");
    return;
  }
  if (!confirm(`Wyczyścić wszystkie ${favorites.size} wybrane zdjęcia i zacząć wybór od nowa?`)) return;
  const button = $("#clearFavoritesBtn");
  if (button) button.disabled = true;
  try {
    await remove(ref(db, `selections/${slug}`));
    favorites.clear();
    toast("Wyczyszczono wszystkie serduszka");
    render();
    updateUI();
  } catch (error) {
    console.error("CLEAR FAVORITES ERROR", error);
    toast(`Nie udało się wyczyścić: ${error.code || error.message || error}`);
  } finally {
    if (button) button.disabled = false;
  }
}

async function approveCurrentSelection() {
  if (!favorites.size) {
    toast("Najpierw wybierz zdjęcia serduszkiem.");
    return;
  }
  const count = favorites.size;
  if (!confirm(`Zatwierdzić ${count} zdjęć do obróbki?\n\nZapiszę datę, godzinę i pełną listę nazw zdjęć.`)) return;
  const button = $("#approveSelectionBtn");
  const old = button?.textContent || "✓ Zatwierdź swoje wybory do obróbki";
  if (button) { button.disabled = true; button.textContent = "Zapisywanie…"; }
  try {
    const filenames = {};
    [...favorites.values()].forEach((item, index) => {
      filenames[selectionKey(item.filename)] = { filename: item.filename };
    });
    const payload = {
      submittedAt: Date.now(),
      selectedCount: count,
      filenames
    };
    const target = push(ref(db, `approvals/${slug}`));
    await set(target, payload);
    latestApproval = payload;
    updateApprovalStatus();
    toast(`Zatwierdzono ${count} zdjęć do obróbki ✓`);
  } catch (error) {
    console.error("APPROVE SELECTION ERROR", error);
    if (String(error.code||"").toUpperCase().includes("PERMISSION")) {
      toast("Brak uprawnień do zatwierdzenia — wklej database-rules.json z v16 i kliknij Publish.");
    } else {
      toast(`Nie udało się zatwierdzić: ${error.code || error.message || error}`);
    }
  } finally {
    if (button) { button.disabled = false; button.textContent = old; }
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


function heroRequiredCount(layout) {
  return layout === "mosaic4" ? 4
    : layout === "trio" ? 3
    : layout === "duo" ? 2
    : layout === "single" ? 1
    : 0;
}

function getHeroPhotos() {
  const required = heroRequiredCount(currentUiConfig.heroLayout);
  if (!required) return [];

  const configured = Array.isArray(gallery?.heroBackgroundFiles)
    ? gallery.heroBackgroundFiles.filter(Boolean)
    : [];

  const legacyPrimary = gallery?.heroBackgroundFile || gallery?.coverFile;
  const requested = [];

  [...configured, legacyPrimary].forEach(filename => {
    if (filename && !requested.includes(filename)) requested.push(filename);
  });

  // Fill missing slots automatically from current public photos.
  photos.forEach(photo => {
    if (requested.length >= required) return;
    if (!requested.includes(photo.filename)) requested.push(photo.filename);
  });

  return requested
    .slice(0, required)
    .map(filename => photos.find(photo => photo.filename === filename))
    .filter(Boolean);
}

function renderHeroMedia() {
  const hero = $("#hero");
  const media = $("#heroMedia");
  if (!hero || !media) return;

  const layout = currentUiConfig.heroLayout || "trio";
  hero.dataset.heroLayout = layout;
  media.innerHTML = "";
  hero.style.backgroundImage = "none";
  hero.style.backgroundColor = currentUiConfig.heroBgColor || "#09090a";

  if (layout === "none") {
    media.hidden = true;
    return;
  }

  const heroPhotos = getHeroPhotos();
  if (!heroPhotos.length) {
    media.hidden = true;
    return;
  }

  media.hidden = false;

  heroPhotos.forEach((photo, index) => {
    const tile = document.createElement("div");
    tile.className = `hero-media-tile hero-media-tile-${index + 1}`;
    tile.style.backgroundImage = `url("${photo.preview}")`;

    // Keep old manually selected focal point for the first / main tile.
    if (index === 0) {
      tile.style.backgroundPosition =
        `${Number(gallery.coverPositionX ?? 50)}% ${Number(gallery.coverPositionY ?? 38)}%`;
    }

    media.appendChild(tile);
  });
}

function loadManifest() {
  const manifest = gallery.photos || {};

  photos = Object.values(manifest)
    .filter(item => item?.filename && item?.previewUrl && item.hiddenFromClient !== true)
    .sort((a, b) => a.filename.localeCompare(b.filename, undefined, { numeric: true }))
    .map(item => ({
      filename: item.filename,
      preview: item.previewUrl,
      originalPath: item.originalPath || `galleries/${slug}/originals/${item.filename}`,
      originalUrl: null,
      width: Number(item.width || 0),
      height: Number(item.height || 0),
      orientation: item.orientation || detectOrientation(Number(item.width || 0), Number(item.height || 0)),
      featured: item.featured === true
    }));

  $("#loading").hidden = true;
  $("#photoCountHero").textContent = `${photos.length} zdjęć`;

  if (!photos.length) {
    $("#storageError").hidden = false;
    $("#storageError").textContent = "W tej galerii nie ma jeszcze zdjęć.";
    render();
    return;
  }

  renderHeroMedia();

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
    img.draggable = false;
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

    const featured = document.createElement("div");
    featured.className = "photo-featured-badge";
    featured.textContent = "★ Polecane";
    featured.title = "Zdjęcie polecane przez fotografa";
    featured.hidden = photo.featured !== true;

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

    const toolButtons = [];
    if (currentUiConfig.showHeartButton !== false) toolButtons.push(heart);
    if (currentUiConfig.showRejectButton !== false) toolButtons.push(rejectBtn);
    if (currentUiConfig.showCompareButton !== false) toolButtons.push(compareBtn);
    if (currentUiConfig.showSingleDownloadButton !== false && canDownloadSingle()) toolButtons.push(downloadOne);
    if (currentUiConfig.showDownloadSelectButton !== false) {
      selectDownload.disabled = !canDownloadSelected();
      if (!canDownloadSelected()) selectDownload.title = "Pobieranie zaznaczonych jest wyłączone";
      toolButtons.push(selectDownload);
    }
    tools.append(...toolButtons);
    tools.hidden = toolButtons.length === 0;
    card.append(skeleton, img, featured, tools, filename);
    grid.appendChild(card);
  });

  updateUI();
}

async function toggleFavorite(filename) {
  if (currentUiConfig.showHeartButton === false) return;
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
  if (currentUiConfig.showCompareButton === false) return;
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

  $("#compareImageA").draggable = false;
  $("#compareImageB").draggable = false;
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
  const showBar = currentUiConfig.showCompareButton !== false && count > 0;
  bar.hidden = !showBar;
  document.body.classList.toggle("compare-bar-visible", showBar);
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
    inlineHeartDownload.hidden = currentUiConfig.showHeartButton === false || !canDownloadFavorites() || count === 0;
    inlineHeartDownload.textContent = `♥ ${currentUiConfig.labels.downloadFavorites || "Pobierz wybrane"} (${count})`;
  }
  const progressWrap = $("#progressWrap");
  if (progressWrap && currentUiConfig.showHeartButton === false) progressWrap.hidden = true;

  const workflow = $("#selectionWorkflow");
  if (workflow) workflow.hidden = currentUiConfig.showHeartButton === false;
  if ($("#clearFavoritesBtn")) $("#clearFavoritesBtn").disabled = count === 0;
  if ($("#approveSelectionBtn")) $("#approveSelectionBtn").disabled = count === 0;
  updateApprovalStatus();

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
  bar.hidden = currentUiConfig.showDownloadSelectButton === false || !canDownloadSelected() || count === 0;

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
  if (!canDownloadSingle()) {
    toast("Pobieranie pojedynczych zdjęć jest wyłączone dla tej galerii.");
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
  if (!canDownloadFavorites()) {
    toast("Pobieranie zdjęć wybranych serduszkiem jest wyłączone.");
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
  if (!canDownloadSelected()) {
    toast("Pobieranie zaznaczonych zdjęć jest wyłączone.");
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
  $("#lightboxImage").draggable = false;

  updateLightboxUI();
  updateSlideshowButtons();
}

function updateLightboxUI() {
  const photo = photos[currentIndex];
  if (!photo) return;

  const selected = favorites.has(photo.filename);

  $("#lightboxCaption").textContent = `${currentIndex + 1} / ${photos.length} · ${displayName(photo.filename)}`;
  $("#lightboxFav").textContent = selected ? "♥" : "♡";
  $("#lightboxFav").classList.toggle("active", selected);
  $("#lightboxFav").hidden = currentUiConfig.showHeartButton === false;
  $("#lightboxReject").classList.toggle("active", rejected.has(photo.filename));
  $("#lightboxReject").hidden = currentUiConfig.showRejectButton === false;
  $("#lightboxDownload").hidden = currentUiConfig.showSingleDownloadButton === false || !canDownloadSingle();
  updateSlideshowButtons();
}

async function changeLightbox(delta) {
  currentIndex = (currentIndex + delta + photos.length) % photos.length;
  const photo = photos[currentIndex];

  $("#lightboxImage").src = photo.preview;
  updateLightboxUI();
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
    submitButton.textContent = clientLoginConfig.buttonLabel || "Otwórz galerię";
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

$("#clearFavoritesBtn")?.addEventListener("click", clearAllFavorites);
$("#approveSelectionBtn")?.addEventListener("click", approveCurrentSelection);

// Basic browser deterrence. This blocks normal Save image as / dragging / long-press menu.
// It cannot prevent screenshots or an advanced user from inspecting network requests.
document.addEventListener("contextmenu", (event) => {
  if (currentUiConfig.blockSaveImage === false) return;
  if (event.target.closest(".photo-card, .lightbox-stage, .compare-pane, .client-hero, .intro-screen")) {
    event.preventDefault();
  }
});
document.addEventListener("dragstart", (event) => {
  if (currentUiConfig.blockSaveImage === false) return;
  if (event.target instanceof HTMLImageElement || event.target.closest?.(".client-hero, .intro-backdrop")) {
    event.preventDefault();
  }
});

init();