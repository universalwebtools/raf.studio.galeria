import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getDatabase, ref, get, set, remove, update, push, onValue, runTransaction } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";
import { getStorage, ref as sRef, getDownloadURL, getBlob } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-functions.js";
import { firebaseConfig } from "./firebase-config.js?v=16.2.4.2.1";
import { buildZip, saveBlob } from "./zip.js?v=22.0.0";

const fb = initializeApp(firebaseConfig);
const auth = getAuth(fb);
const db = getDatabase(fb);
const storage = getStorage(fb);
const galleryAccessFn = httpsCallable(getFunctions(fb, "europe-west1"), "galleryAccess");

const $ = (selector, root = document) => root.querySelector(selector);
const slug = new URLSearchParams(location.search).get("g") || "";

const LOGIN_CONFIG_PATH = "galleries/__system__/public/clientLoginConfig";
const ZONE_CONFIG_PATH = "galleries/__system__/public/clientZoneConfig";
const THEME_KEY = "raf-gallery-theme";
const SESSION_KEY = `raf-access-${slug}`;
const COMMENT_DRAFT_KEY = `raf-selection-comment:${slug}`;
const REVIEW_KEY = `raf-review-asked:${slug}`;

const STATUS_MAP = {
  waiting: { label: "Czekam na Twój wybór zdjęć.", icon: "○", tone: "neutral" },
  selected: { label: "Twój wybór został zapisany. Dziękuję!", icon: "✓", tone: "selected" },
  editing: { label: "Twoje zdjęcia są teraz w obróbce.", icon: "✦", tone: "editing" },
  ready: { label: "Zdjęcia są gotowe.", icon: "✓", tone: "ready" },
  delivered: { label: "Galeria została dostarczona.", icon: "✓", tone: "ready" }
};

let gallery = null;
let ui = {};
let zoneConfig = {};
let photos = [];
let videos = [];
let favorites = new Map();
let latestApproval = null;
let view = "all";
let opened = false;

let lbList = [];
let lbIndex = 0;
let slideshowTimer = null;
let noteTarget = "";
let zipBusy = false;
const viewedThisSession = new Set();

// ---------------------------------------------------------------- narzędzia

function toast(message, ms = 2600) {
  const el = $("#toast");
  el.textContent = message;
  el.hidden = false;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.hidden = true; }, ms);
}

function displayName(filename) {
  return String(filename || "").replace(/\.(jpe?g|png|webp|heic|tiff?)$/i, "");
}

function selectionKey(filename) {
  const bytes = new TextEncoder().encode(filename);
  let binary = "";
  bytes.forEach(b => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function plural(n, one, few, many) {
  if (n === 1) return one;
  const last = n % 10, lastTwo = n % 100;
  return last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? few : many;
}
const photosWord = n => `${n} ${plural(n, "zdjęcie", "zdjęcia", "zdjęć")}`;

function formatDate(value) {
  const d = new Date(`${value}T12:00:00`);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" }) : "";
}

function formatDateTime(ts) {
  return new Date(Number(ts)).toLocaleString("pl-PL", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
}

function daysLeft(value) {
  if (!value) return null;
  const end = new Date(`${value}T23:59:59`);
  if (!Number.isFinite(end.getTime())) return null;
  return Math.floor((end - Date.now()) / 86400000);
}

function isExpired() {
  if (!gallery?.expiresAt) return false;
  return new Date(`${gallery.expiresAt}T23:59:59`) < new Date();
}

function safeUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" ? url.href : "";
  } catch (_) { return ""; }
}

function store(key, value) {
  try { value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value); } catch (_) {}
}
function load(key) {
  try { return localStorage.getItem(key); } catch (_) { return null; }
}

function svgIcon(id) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  const use = document.createElementNS(ns, "use");
  use.setAttribute("href", `#${id}`);
  svg.appendChild(use);
  return svg;
}

function setIcon(button, id) {
  button.replaceChildren(svgIcon(id));
}

// ---------------------------------------------------------------- motyw

function applyTheme(theme) {
  const dark = theme === "dark";
  if (dark) document.documentElement.dataset.theme = "dark";
  else delete document.documentElement.dataset.theme;
  document.querySelectorAll(".theme-toggle").forEach(btn => setIcon(btn, dark ? "i-sun" : "i-moon"));
  $('meta[name="theme-color"]')?.setAttribute("content", dark ? "#0b0b0c" : "#ffffff");
}

document.querySelectorAll(".theme-toggle").forEach(btn => btn.addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  store(THEME_KEY, next);
  applyTheme(next);
}));
applyTheme(load(THEME_KEY) === "dark" ? "dark" : "light");

// ---------------------------------------------------------------- uprawnienia z ustawień galerii

const heartsEnabled = () => ui.showHeartButton !== false;
const downloadsEnabled = () => gallery?.downloadsEnabled !== false;
const canDownloadSingle = () => downloadsEnabled() && ui.allowSingleDownload !== false && ui.showSingleDownloadButton !== false;
const canDownloadFavorites = () => downloadsEnabled() && ui.allowFavoriteDownloads !== false;
const maxFavorites = () => Number(gallery?.maxFavorites || 0);

// ---------------------------------------------------------------- dostęp

function showFatal(message) {
  $("#gateForm").hidden = true;
  const el = $("#gateFatal");
  el.textContent = message;
  el.hidden = false;
}

function isPermissionDenied(error) {
  const code = String(error?.code || error?.message || "").toLowerCase();
  return code.includes("permission") || code.includes("denied");
}

async function readGalleryPublic() {
  try { return { snap: await get(ref(db, `galleries/${slug}/public`)) }; }
  catch (error) { return { error }; }
}

async function callGalleryAccess(payload) {
  const result = await galleryAccessFn(payload);
  return result?.data || {};
}

function showAccessStatus(info) {
  switch (info?.status) {
    case "ok": case "wrong-password": case "rate-limited": return true;
    case "inactive": showFatal("Ta galeria jest obecnie wyłączona."); return false;
    case "expired": showFatal("Dostęp do tej galerii wygasł. Jeśli potrzebujesz zdjęć, napisz do mnie."); return false;
    default: showFatal("Nie znaleziono galerii. Sprawdź link albo kod galerii."); return false;
  }
}

function acceptGalleryData(data) {
  gallery = data || {};
  ui = gallery.uiConfig || {};
  if (gallery.active === false) { showFatal("Ta galeria jest obecnie wyłączona."); return false; }
  if (isExpired()) { showFatal("Dostęp do tej galerii wygasł. Jeśli potrzebujesz zdjęć, napisz do mnie."); return false; }
  $("#gateTitle").textContent = gallery.title || "Galeria klienta";
  document.title = `${gallery.title || "Galeria klienta"} — RAF.studio`;
  return true;
}

async function sha256(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

// Lokalne sprawdzenie — tylko gdy to urządzenie ma już dostęp (hash jest wtedy czytelny).
async function passwordMatchesLocally(entered) {
  const raw = String(entered ?? "");
  const trimmed = raw.trim();
  const trimmedHash = await sha256(trimmed);
  if (gallery.passwordHashTrimmed && trimmedHash === gallery.passwordHashTrimmed) return true;
  if (gallery.passwordHash) {
    if (trimmedHash === gallery.passwordHash) return true;
    if (raw !== trimmed && await sha256(raw) === gallery.passwordHash) return true;
  }
  if (typeof gallery.password === "string") return raw === gallery.password || trimmed === gallery.password.trim();
  return false;
}

async function unlockOnServer(entered) {
  if (!auth.currentUser) await signInAnonymously(auth);
  const result = await callGalleryAccess({ action: "unlock", slug, password: entered });
  if (result.status === "rate-limited") throw new Error("Zbyt wiele prób. Spróbuj ponownie za kilkanaście minut.");
  if (result.status === "wrong-password") return false;
  if (result.status !== "ok") { showAccessStatus(result); throw new Error("Galeria jest niedostępna."); }

  await auth.currentUser.getIdToken(true); // nowy token z dostępem do plików
  const publicResult = await readGalleryPublic();
  if (!publicResult.snap?.exists()) throw publicResult.error || new Error("Nie udało się wczytać galerii.");
  if (!acceptGalleryData(publicResult.snap.val())) throw new Error("Galeria jest niedostępna.");
  return true;
}

function applyLoginConfig(raw = {}) {
  if (raw.eyebrow) $("#gateKicker").textContent = raw.eyebrow;
  $("#gateKicker").hidden = raw.showEyebrow === false;
  if (raw.instruction) $("#gateLead").textContent = raw.instruction;
  $("#gateLead").hidden = raw.showInstruction === false;
  if (raw.passwordPlaceholder) $("#passwordInput").placeholder = raw.passwordPlaceholder;
  if (raw.buttonLabel) $("#gateSubmit").textContent = raw.buttonLabel;
}

function applyZoneConfig(raw = {}) {
  zoneConfig = raw || {};
  const list = $("#ftrContact");
  const items = [];
  const email = String(zoneConfig.contactEmail || "").trim();
  if (email) items.push([`mailto:${email}`, email]);
  const insta = safeUrl(zoneConfig.contactInstagram);
  if (insta) items.push([insta, "Instagram"]);
  items.push(["https://raf-studio.pl/kontakt/", "Formularz kontaktowy"]);
  list.replaceChildren(...items.map(([href, label]) => {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = href;
    a.textContent = label;
    if (href.startsWith("http")) a.rel = "noopener";
    li.appendChild(a);
    return li;
  }));
  if (email) $("#gateContact").href = `mailto:${email}`;
  if (zoneConfig.copyrightText) $("#ftrCopy").textContent = zoneConfig.copyrightText;
}

async function init() {
  if (!slug) return;
  try {
    await signInAnonymously(auth);
    const [loginSnap, zoneSnap, publicResult] = await Promise.all([
      get(ref(db, LOGIN_CONFIG_PATH)).catch(() => null),
      get(ref(db, ZONE_CONFIG_PATH)).catch(() => null),
      readGalleryPublic()
    ]);
    if (loginSnap?.exists()) applyLoginConfig(loginSnap.val());
    if (zoneSnap?.exists()) applyZoneConfig(zoneSnap.val());

    if (publicResult.snap) {
      if (!publicResult.snap.exists()) { showFatal("Nie znaleziono galerii."); return; }
      if (!acceptGalleryData(publicResult.snap.val())) return;
      if (sessionStorage.getItem(SESSION_KEY) === "1") openGallery();
      return;
    }

    if (!isPermissionDenied(publicResult.error)) throw publicResult.error;
    const info = await callGalleryAccess({ action: "info", slug });
    if (!showAccessStatus(info)) return;
    if (info.title) {
      $("#gateTitle").textContent = info.title;
      document.title = `${info.title} — RAF.studio`;
    }
  } catch (error) {
    console.error("INIT ERROR", error);
    showFatal(`Nie udało się uruchomić galerii (${error.code || error.message || error}). Odśwież stronę.`);
  }
}

$("#gateForm").addEventListener("submit", async event => {
  event.preventDefault();
  const input = $("#passwordInput");
  const errorEl = $("#gateError");
  const button = $("#gateSubmit");
  const label = button.textContent;
  errorEl.hidden = true;

  const entered = input.value;
  if (!entered.trim()) {
    errorEl.textContent = "Wpisz hasło.";
    errorEl.hidden = false;
    return;
  }

  button.disabled = true;
  button.textContent = "Sprawdzam…";
  try {
    const ok = gallery ? await passwordMatchesLocally(entered) : await unlockOnServer(entered);
    if (!ok) {
      errorEl.textContent = "Nieprawidłowe hasło.";
      errorEl.hidden = false;
      input.select();
      return;
    }
    sessionStorage.setItem(SESSION_KEY, "1");
    openGallery();
  } catch (error) {
    console.error("LOGIN ERROR", error);
    errorEl.textContent = error.message || String(error);
    errorEl.hidden = false;
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
});

$("#logoutBtn").addEventListener("click", () => {
  sessionStorage.removeItem(SESSION_KEY);
  location.reload();
});

// ---------------------------------------------------------------- galeria

function buildPhotos() {
  photos = Object.values(gallery.photos || {})
    .filter(item => item?.filename && item.hiddenFromClient !== true)
    .sort((a, b) => a.filename.localeCompare(b.filename, undefined, { numeric: true }))
    .map(item => {
      const w = Number(item.width || 0), h = Number(item.height || 0);
      return {
        filename: item.filename,
        preview: item.previewUrl || "",
        originalPath: item.originalPath || `galleries/${slug}/originals/${item.filename}`,
        ar: w > 0 && h > 0 ? Math.min(3, Math.max(0.33, w / h)) : 1.5,
        featured: item.featured === true
      };
    });
}

function buildVideos() {
  videos = Object.entries(gallery.videos || {})
    .map(([key, item]) => ({ key, ...item }))
    .filter(item => item && item.hidden !== true && (item.url || item.path))
    .sort((a, b) => Number(a.order ?? a.addedAt ?? 0) - Number(b.order ?? b.addedAt ?? 0));
}

async function freshPreviewUrl(photo) {
  try {
    photo.preview = await getDownloadURL(sRef(storage, `galleries/${slug}/previews/${photo.filename}.webp`));
  } catch (error) {
    console.warn("PREVIEW REFRESH FAILED", photo.filename, error?.code || error);
  }
  return photo.preview;
}

function openGallery() {
  if (opened) return;
  opened = true;
  buildPhotos();
  buildVideos();

  $("#gate").hidden = true;
  $("#galleryView").hidden = false;
  $("#hdrNav").hidden = true;
  $("#hdrActions").hidden = false;
  $("#hdrTitle").hidden = false;
  $("#hdrTitle").textContent = gallery.title || "";
  $("#favChip").hidden = !heartsEnabled();
  $("#tabFavorites").hidden = !heartsEnabled();
  document.documentElement.style.setProperty("--gap", `${Math.min(24, Math.max(2, Number(ui.gridGap ?? 10)))}px`);

  renderHero();
  renderNotices();
  renderFooter();
  renderVideos();
  render();

  if (heartsEnabled()) watchSelections();
  watchApprovals();
  onValue(ref(db, `galleries/${slug}/public/workflowStatus`), snap => renderStatus(snap.val()), () => renderStatus(null));
  trackVisit();
}

function renderHero() {
  const date = gallery.eventDate ? formatDate(gallery.eventDate) : "";
  $("#heroKicker").textContent = date ? `Galeria klienta · ${date}` : "Galeria klienta";
  $("#heroTitle").textContent = gallery.title || "Galeria klienta";
  const lead = gallery.introMessage || gallery.subtitle || "";
  $("#heroLead").textContent = lead;
  $("#heroLead").hidden = !lead;
  const parts = [photosWord(photos.length)];
  if (videos.length) parts.push(`${videos.length} ${plural(videos.length, "film", "filmy", "filmów")}`);
  $("#heroCount").textContent = parts.join(" · ");
  if (gallery.expiresAt) {
    $("#heroExpiry").textContent = `Dostęp do ${formatDate(gallery.expiresAt)}`;
    $("#heroExpiry").hidden = false;
  }
  $("#heroZipBtn").hidden = !downloadsEnabled() || !photos.length;
  $("#heroSlideshowBtn").hidden = !photos.length;
  $("#barSlideshowBtn").hidden = !photos.length;

  const heroFile = gallery.heroBackgroundFile || gallery.coverFile;
  const cover = photos.find(p => p.filename === heroFile) || photos[0];
  const img = $("#heroImg");
  if (!cover) return;
  img.style.objectPosition = `${Number(gallery.coverPositionX ?? 50)}% ${Number(gallery.coverPositionY ?? 38)}%`;
  img.onload = () => img.classList.add("is-ready");
  img.onerror = async () => {
    if (img.dataset.retry) return;
    img.dataset.retry = "1";
    const url = await freshPreviewUrl(cover);
    if (url) img.src = url;
  };
  img.src = cover.preview;
}

function renderNotices() {
  const left = daysLeft(gallery.expiresAt);
  if (left !== null && left >= 0 && left <= 7) {
    const when = left === 0 ? "dziś" : left === 1 ? "jutro" : `za ${left} dni`;
    $("#expiryText").textContent = `Galeria wygasa ${when} (${formatDate(gallery.expiresAt)}). Pobierz zdjęcia, zanim dostęp się zakończy.`;
    $("#expiryZipBtn").hidden = !downloadsEnabled() || !photos.length;
    $("#expiryNotice").hidden = false;
  }
}

function renderStatus(value) {
  const key = typeof value === "string" ? value : String(value?.key || "waiting");
  const item = STATUS_MAP[key] || STATUS_MAP.waiting;
  const notice = $("#statusNotice");
  if (key === "waiting" && !heartsEnabled()) { notice.hidden = true; return; }
  notice.dataset.tone = item.tone;
  $("#statusIcon").textContent = item.icon;
  $("#statusText").textContent = (typeof value === "object" && value?.label) ? value.label : item.label;
  notice.hidden = false;
}

function renderFooter() {
  $("#ftrThanks").hidden = false;
  if (gallery.outroMessage) {
    $("#ftrOutro").textContent = gallery.outroMessage;
    $("#ftrOutro").hidden = false;
  }
}

function videoEmbed(item) {
  const url = String(item.url || "");
  const yt = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/))([\w-]{11})/);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}?rel=0`;
  const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}?dnt=1`;
  return "";
}

async function renderVideos() {
  $("#tabVideos").hidden = !videos.length;
  $("#countVideos").textContent = videos.length ? ` ${videos.length}` : "";
  const box = $("#videos");
  box.replaceChildren();
  for (const item of videos) {
    const fig = document.createElement("figure");
    fig.className = "video";
    const frame = document.createElement("div");
    frame.className = "video__frame";
    const embed = videoEmbed(item);
    if (embed) {
      const iframe = document.createElement("iframe");
      iframe.src = embed;
      iframe.title = item.title || "Film";
      iframe.loading = "lazy";
      iframe.allow = "autoplay; fullscreen; picture-in-picture; encrypted-media";
      iframe.allowFullscreen = true;
      frame.appendChild(iframe);
    } else {
      const video = document.createElement("video");
      video.controls = true;
      video.preload = "metadata";
      video.playsInline = true;
      frame.appendChild(video);
      try {
        video.src = item.path ? await getDownloadURL(sRef(storage, item.path)) : safeUrl(item.url);
      } catch (error) {
        console.warn("VIDEO URL FAILED", item.path, error?.code || error);
      }
    }
    fig.appendChild(frame);
    if (item.title) {
      const cap = document.createElement("figcaption");
      cap.textContent = item.title;
      fig.appendChild(cap);
    }
    box.appendChild(fig);
  }
  updateSections();
}

function updateSections() {
  $("#videosSection").hidden = !videos.length || view === "favorites";
  const showPhotos = view !== "videos";
  $("#grid").hidden = !showPhotos;
  $("#photosTitle").hidden = !(showPhotos && videos.length && view === "all");
}

function visiblePhotos() {
  return view === "favorites" ? photos.filter(p => favorites.has(p.filename)) : photos;
}

function render() {
  $("#loading").hidden = true;
  updateSections();
  const grid = $("#grid");
  const list = visiblePhotos();
  if (view === "videos") { grid.replaceChildren(); updateCounts(); return; }

  if (!list.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = view === "favorites"
      ? "Nie wybrano jeszcze żadnych zdjęć. Kliknij serduszko przy zdjęciu, które Ci się podoba."
      : "W tej galerii nie ma jeszcze zdjęć.";
    grid.replaceChildren(empty);
    updateCounts();
    return;
  }

  const fragment = document.createDocumentFragment();
  list.forEach((photo, index) => fragment.appendChild(photoCard(photo, index, list)));
  grid.replaceChildren(fragment);
  layoutGrid();
  observeViews();
  updateCounts();
}

function photoCard(photo, index, list) {
  const fav = favorites.get(photo.filename);
  const card = document.createElement("figure");
  card.className = `ph${fav ? " is-fav" : ""}`;
  card.style.setProperty("--ar", photo.ar.toFixed(4));
  card.dataset.filename = photo.filename;
  card.tabIndex = 0;

  const img = document.createElement("img");
  img.loading = index < 8 ? "eager" : "lazy";
  img.decoding = "async";
  img.alt = displayName(photo.filename);
  img.draggable = false;
  img.addEventListener("load", () => img.classList.add("is-loaded"));
  img.addEventListener("error", async () => {
    if (img.dataset.retry) return;
    img.dataset.retry = "1";
    const url = await freshPreviewUrl(photo);
    if (url) img.src = url;
  });
  img.src = photo.preview;
  card.appendChild(img);

  if (photo.featured) {
    const flag = document.createElement("span");
    flag.className = "ph__flag";
    flag.textContent = "★ Polecane";
    card.appendChild(flag);
  }
  if (ui.showFilenames !== false) {
    const name = document.createElement("figcaption");
    name.className = "ph__name";
    name.textContent = displayName(photo.filename);
    card.appendChild(name);
  }

  const tools = document.createElement("div");
  tools.className = "ph__tools";
  if (canDownloadSingle()) tools.appendChild(toolButton("i-down", "Pobierz zdjęcie", "ph__btn", () => downloadSingle(photo)));
  if (heartsEnabled()) {
    const note = toolButton("i-note", fav?.note ? "Edytuj uwagę do zdjęcia" : "Dodaj uwagę do zdjęcia", `ph__btn ph__btn--note${fav?.note ? " is-on" : ""}`, () => openNote(photo.filename));
    const heart = toolButton(fav ? "i-heart" : "i-heart-o", fav ? "Usuń z wybranych" : "Dodaj do wybranych", `ph__btn ph__btn--fav${fav ? " is-on" : ""}`, () => toggleFavorite(photo.filename));
    tools.append(note, heart);
  }
  card.appendChild(tools);

  card.addEventListener("click", () => openLightbox(list, index));
  card.addEventListener("keydown", event => { if (event.key === "Enter") openLightbox(list, index); });
  return card;
}

// Wiersze wyjustowane: każdy rząd ma równą wysokość i wypełnia całą szerokość.
function targetRowHeight(width) {
  return width < 640 ? 150 : width < 960 ? 220 : 300;
}

function layoutGrid() {
  const grid = $("#grid");
  const cards = [...grid.querySelectorAll(".ph")];
  const width = grid.clientWidth;
  if (!cards.length || !width) return;
  const gap = parseFloat(getComputedStyle(grid).columnGap) || 0;
  const target = targetRowHeight(width);
  let row = [];
  let sumAr = 0;
  const place = (items, height) => items.forEach(card => {
    card.style.flex = "0 0 auto";
    card.style.width = `${Math.floor(Number(card.style.getPropertyValue("--ar")) * height * 100) / 100}px`;
    card.style.height = `${Math.floor(height * 100) / 100}px`;
  });
  cards.forEach(card => {
    row.push(card);
    sumAr += Number(card.style.getPropertyValue("--ar"));
    const height = (width - gap * (row.length - 1)) / sumAr;
    if (height <= target) {
      place(row, height);
      row = [];
      sumAr = 0;
    }
  });
  if (row.length) place(row, target); // ostatni, niepełny rząd — bez rozciągania
}

let lastGridWidth = 0;
new ResizeObserver(() => {
  const width = $("#grid").clientWidth;
  if (width && width !== lastGridWidth) { lastGridWidth = width; layoutGrid(); }
}).observe($("#grid"));

function toolButton(icon, title, className, handler) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = className;
  btn.title = title;
  btn.setAttribute("aria-label", title);
  btn.appendChild(svgIcon(icon));
  btn.addEventListener("click", event => { event.stopPropagation(); handler(); });
  return btn;
}

function updateCounts() {
  const count = favorites.size;
  const max = maxFavorites();
  $("#countAll").textContent = ` ${photos.length}`;
  $("#countFav").textContent = ` ${count}`;
  $("#favChipCount").textContent = max ? `${count}/${max}` : String(count);
  updateSelbar();
  updateBarZip();
}

document.querySelectorAll(".tab").forEach(tab => tab.addEventListener("click", () => setView(tab.dataset.view)));
$("#favChip").addEventListener("click", () => {
  setView("favorites");
  $("#photos").scrollIntoView({ behavior: "smooth" });
});

function setView(next) {
  view = next;
  document.querySelectorAll(".tab").forEach(tab => tab.setAttribute("aria-selected", String(tab.dataset.view === view)));
  render();
}

// ---------------------------------------------------------------- wybór zdjęć

function normalizeSelections(raw) {
  const exact = new Map(photos.map(p => [p.filename, p.filename]));
  const byBase = new Map(photos.map(p => [displayName(p.filename).toLowerCase(), p.filename]));
  const result = new Map();
  Object.values(raw || {}).forEach(item => {
    if (!item?.filename || item.rejected === true) return; // dawne „odrzucone” są pomijane
    const name = exact.get(item.filename) || byBase.get(displayName(item.filename).toLowerCase());
    if (!name) return;
    const existing = result.get(name);
    if (!existing || Number(item.selectedAt || 0) < Number(existing.selectedAt || 0)) result.set(name, { ...item, filename: name });
  });
  const items = [...result.values()].sort((a, b) => Number(a.selectedAt || 0) - Number(b.selectedAt || 0));
  const max = maxFavorites();
  return new Map((max > 0 ? items.slice(0, max) : items).map(item => [item.filename, item]));
}

function watchSelections() {
  onValue(ref(db, `selections/${slug}`), snap => {
    favorites = normalizeSelections(snap.val());
    render();
    if (!$("#lightbox").hidden) updateLightbox();
  }, error => console.error("SELECTIONS WATCH ERROR", error));
}

function watchApprovals() {
  onValue(ref(db, `approvals/${slug}`), snap => {
    const rows = Object.values(snap.val() || {})
      .filter(row => row?.submittedAt && row.mode !== "rejected")
      .sort((a, b) => Number(b.submittedAt) - Number(a.submittedAt));
    latestApproval = rows[0] || null;
    updateSelbar();
  }, () => {});
}

async function writeSelection(filename, value) {
  const target = ref(db, `selections/${slug}/${selectionKey(filename)}`);
  return value ? set(target, value) : remove(target);
}

async function toggleFavorite(filename) {
  if (!heartsEnabled()) return;
  const current = favorites.get(filename);
  if (!current && maxFavorites() > 0 && favorites.size >= maxFavorites()) {
    toast(`Możesz wybrać maksymalnie ${photosWord(maxFavorites())}.`);
    return;
  }
  if (current?.note && !confirm("Usunąć zdjęcie z wybranych? Twoja uwaga do tego zdjęcia też zostanie usunięta.")) return;

  const next = current ? null : { filename, selectedAt: Date.now() };
  if (next) favorites.set(filename, next); else favorites.delete(filename);
  render();
  if (!$("#lightbox").hidden) updateLightbox();
  try {
    await writeSelection(filename, next);
  } catch (error) {
    console.error("FAVORITE WRITE ERROR", error);
    if (current) favorites.set(filename, current); else favorites.delete(filename);
    render();
    toast("Nie udało się zapisać wyboru. Sprawdź internet i spróbuj ponownie.");
  }
}

function openNote(filename) {
  if (!heartsEnabled()) return;
  const current = favorites.get(filename);
  if (!current && maxFavorites() > 0 && favorites.size >= maxFavorites()) {
    toast(`Możesz wybrać maksymalnie ${photosWord(maxFavorites())}.`);
    return;
  }
  noteTarget = filename;
  $("#noteTitle").textContent = displayName(filename);
  $("#noteInput").value = current?.note || "";
  $("#noteDelete").hidden = !current?.note;
  $("#noteDialog").showModal();
  $("#noteInput").focus();
}

async function saveNote(text) {
  const filename = noteTarget;
  const current = favorites.get(filename);
  const note = String(text || "").trim().slice(0, 400);
  const next = { filename, selectedAt: current?.selectedAt || Date.now() };
  if (note) next.note = note;
  try {
    await writeSelection(filename, next);
    favorites.set(filename, next);
    render();
    if (!$("#lightbox").hidden) updateLightbox();
    toast(note ? "Zapisano uwagę do zdjęcia" : "Usunięto uwagę");
  } catch (error) {
    console.error("NOTE WRITE ERROR", error);
    toast("Nie udało się zapisać uwagi.");
  }
}

$("#noteSave").addEventListener("click", () => { $("#noteDialog").close(); saveNote($("#noteInput").value); });
$("#noteDelete").addEventListener("click", () => { $("#noteDialog").close(); saveNote(""); });

function approvalMatchesSelection() {
  if (!latestApproval) return false;
  const approved = new Set(Object.values(latestApproval.filenames || {}).map(item => item?.filename));
  if (approved.size !== favorites.size) return false;
  return [...favorites.keys()].every(name => approved.has(name));
}

function updateSelbar() {
  const bar = $("#selbar");
  if (!opened || !heartsEnabled() || (!favorites.size && !latestApproval)) { bar.hidden = true; return; }
  const count = favorites.size;
  const max = maxFavorites();
  $("#selbarCount").textContent = max ? `Wybrano ${count} z ${max}` : `Wybrano ${photosWord(count)}`;
  const progress = $("#selbarProgress");
  progress.hidden = !max;
  if (max) progress.firstElementChild.style.width = `${Math.min(100, (count / max) * 100)}%`;

  let status;
  if (!latestApproval) status = "Gdy skończysz wybierać, kliknij „Zatwierdź wybór”.";
  else if (approvalMatchesSelection()) status = `Zatwierdzono ${formatDateTime(latestApproval.submittedAt)}`;
  else status = "Wybór zmienił się od ostatniego zatwierdzenia — zatwierdź ponownie.";
  $("#selbarStatus").textContent = status;
  $("#selbarApprove").disabled = !count;
  $("#selbarApprove").textContent = latestApproval && approvalMatchesSelection() ? "Zatwierdzono ✓" : "Zatwierdź wybór";
  $("#selbarZip").hidden = !count || !canDownloadFavorites();
  bar.hidden = false;
}

$("#selbarApprove").addEventListener("click", () => {
  if (!favorites.size) return;
  const list = $("#approveList");
  list.replaceChildren(...[...favorites.values()].map(item => {
    const photo = photos.find(p => p.filename === item.filename);
    const fig = document.createElement("figure");
    if (item.note) { fig.className = "has-note"; fig.title = item.note; }
    const img = document.createElement("img");
    img.src = photo?.preview || "";
    img.alt = "";
    img.loading = "lazy";
    const cap = document.createElement("figcaption");
    cap.textContent = displayName(item.filename);
    fig.append(img, cap);
    return fig;
  }));
  const notes = [...favorites.values()].filter(item => item.note).length;
  $("#approveLead").textContent = `Wysyłasz ${photosWord(favorites.size)}${notes ? `, w tym ${notes} z uwagami` : ""}. Po zatwierdzeniu dostanę powiadomienie i zajmę się obróbką. Wybór możesz później zmienić i zatwierdzić ponownie.`;
  $("#approveComment").value = load(COMMENT_DRAFT_KEY) || "";
  $("#approveDialog").showModal();
});

$("#approveComment").addEventListener("input", event => store(COMMENT_DRAFT_KEY, event.target.value));

$("#approveConfirm").addEventListener("click", async () => {
  const button = $("#approveConfirm");
  button.disabled = true;
  button.textContent = "Zapisuję…";
  try {
    const filenames = {};
    [...favorites.values()].forEach(item => {
      filenames[selectionKey(item.filename)] = item.note ? { filename: item.filename, note: item.note } : { filename: item.filename };
    });
    const payload = { submittedAt: Date.now(), selectedCount: favorites.size, filenames };
    const comment = $("#approveComment").value.trim().slice(0, 800);
    if (comment) payload.comment = comment;
    await set(push(ref(db, `approvals/${slug}`)), payload);
    latestApproval = payload;
    store(COMMENT_DRAFT_KEY, null);
    $("#approveDialog").close();
    updateSelbar();
    toast(`Zatwierdzono ${photosWord(payload.selectedCount)}. Dziękuję!`, 3500);
    setTimeout(askForReview, 900);
  } catch (error) {
    console.error("APPROVE ERROR", error);
    toast("Nie udało się zatwierdzić wyboru. Spróbuj ponownie.");
  } finally {
    button.disabled = false;
    button.textContent = "Zatwierdź";
  }
});

// ---------------------------------------------------------------- opinia Google

function askForReview() {
  const url = safeUrl(zoneConfig.googleReviewUrl);
  if (!url || load(REVIEW_KEY)) return;
  if (document.querySelector("dialog[open]")) return;
  store(REVIEW_KEY, String(Date.now()));
  $("#reviewLink").href = url;
  $("#reviewDialog").showModal();
}
$("#reviewLink").addEventListener("click", () => setTimeout(() => $("#reviewDialog").close(), 300));

// ---------------------------------------------------------------- pobieranie

async function originalUrl(photo) {
  for (const path of [...new Set([photo.originalPath, `galleries/${slug}/originals/${photo.filename}`])]) {
    try { return await getDownloadURL(sRef(storage, path)); } catch (_) {}
  }
  return photo.preview;
}

async function downloadSingle(photo) {
  if (!canDownloadSingle()) return;
  toast("Rozpoczynam pobieranie…");
  try {
    const url = await originalUrl(photo);
    // Pliki mają nagłówek Content-Disposition: attachment, więc ramka tylko uruchamia pobieranie.
    const frame = document.createElement("iframe");
    frame.hidden = true;
    frame.src = url;
    document.body.appendChild(frame);
    setTimeout(() => frame.remove(), 90000);
    metric("singleDownloads");
  } catch (error) {
    console.error("DOWNLOAD ERROR", error);
    toast("Nie udało się pobrać zdjęcia.");
  }
}

async function readOriginal(photo) {
  let lastError;
  for (const path of [...new Set([photo.originalPath, `galleries/${slug}/originals/${photo.filename}`])]) {
    try { return await getBlob(sRef(storage, path)); } catch (error) { lastError = error; }
  }
  throw lastError || new Error(`Brak pliku ${photo.filename}`);
}

function zipProgress(pct, title, file) {
  $("#zipbox").hidden = false;
  $("#zipTitle").textContent = title;
  $("#zipPct").textContent = `${Math.round(pct)}%`;
  $("#zipBar").style.width = `${pct}%`;
  $("#zipFile").textContent = file || "";
}

function zipName(value) {
  return (String(value || "").normalize("NFKD").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim()) || "RAF-studio-galeria";
}

async function downloadZip(items, name, metricName) {
  if (!downloadsEnabled()) return toast("Pobieranie jest wyłączone dla tej galerii.");
  if (zipBusy) return toast("Paczka ZIP jest już przygotowywana.");
  if (!items.length) return toast("Brak zdjęć do pobrania.");
  zipBusy = true;
  try {
    const files = [];
    for (let i = 0; i < items.length; i++) {
      zipProgress((i / items.length) * 80, "Pobieram zdjęcia…", `${i + 1}/${items.length} · ${displayName(items[i].filename)}`);
      files.push({ name: items[i].filename, blob: await readOriginal(items[i]) });
    }
    const zip = await buildZip(files, (done, total) => zipProgress(80 + (done / total) * 20, "Pakuję ZIP…", `${done}/${total}`));
    zipProgress(100, "Gotowe ✓", photosWord(items.length));
    saveBlob(zip, `${zipName(name)}.zip`);
    metric(metricName);
    setTimeout(() => { $("#zipbox").hidden = true; }, 1600);
    setTimeout(askForReview, 2500);
  } catch (error) {
    console.error("ZIP ERROR", error);
    $("#zipbox").hidden = true;
    toast("Nie udało się przygotować paczki ZIP. Spróbuj ponownie albo pobierz zdjęcia pojedynczo.", 6000);
  } finally {
    zipBusy = false;
  }
}

const zipAll = () => downloadZip(photos, gallery.title || slug, "fullGalleryDownloads");
$("#heroZipBtn").addEventListener("click", zipAll);
$("#expiryZipBtn").addEventListener("click", zipAll);
$("#barZipBtn").addEventListener("click", () => {
  if (view === "favorites") downloadZip(photos.filter(p => favorites.has(p.filename)), `${gallery.title || slug} - wybrane`, "favoriteDownloads");
  else zipAll();
});
$("#selbarZip").addEventListener("click", () => downloadZip(photos.filter(p => favorites.has(p.filename)), `${gallery.title || slug} - wybrane`, "favoriteDownloads"));

function updateBarZip() {
  const btn = $("#barZipBtn");
  const favView = view === "favorites";
  btn.hidden = favView ? (!favorites.size || !canDownloadFavorites()) : (!downloadsEnabled() || !photos.length || view === "videos");
  btn.title = favView ? "Pobierz wybrane jako ZIP" : "Pobierz całą galerię jako ZIP";
}

// ---------------------------------------------------------------- podgląd i pokaz slajdów

function openLightbox(list, index) {
  lbList = list.slice();
  lbIndex = index;
  $("#lightbox").hidden = false;
  document.body.style.overflow = "hidden";
  updateLightbox();
}

function updateLightbox() {
  const photo = lbList[lbIndex];
  if (!photo) return closeLightbox();
  const img = $("#lbImg");
  if (img.dataset.filename !== photo.filename) {
    img.dataset.filename = photo.filename;
    img.dataset.retry = "";
    img.src = photo.preview;
    img.alt = displayName(photo.filename);
  }
  const fav = favorites.get(photo.filename);
  $("#lbCount").textContent = `${lbIndex + 1} / ${lbList.length} · ${displayName(photo.filename)}`;
  const favBtn = $("#lbFav");
  favBtn.hidden = !heartsEnabled();
  favBtn.classList.toggle("is-on", Boolean(fav));
  setIcon(favBtn, fav ? "i-heart" : "i-heart-o");
  favBtn.title = fav ? "Usuń z wybranych" : "Dodaj do wybranych";
  $("#lbNote").hidden = !heartsEnabled();
  $("#lbNote").classList.toggle("is-note", Boolean(fav?.note));
  $("#lbDownload").hidden = !canDownloadSingle();
  const noteText = $("#lbNoteText");
  noteText.textContent = fav?.note ? `Twoja uwaga: ${fav.note}` : "";
  noteText.hidden = !fav?.note;
  markViewed(photo.filename);
  // Wstępne wczytanie następnego zdjęcia.
  const next = lbList[(lbIndex + 1) % lbList.length];
  if (next?.preview) { const pre = new Image(); pre.src = next.preview; }
}

$("#lbImg").addEventListener("error", async () => {
  const img = $("#lbImg");
  const photo = lbList[lbIndex];
  if (!photo || img.dataset.retry) return;
  img.dataset.retry = "1";
  const url = await freshPreviewUrl(photo);
  if (url) img.src = url;
});

function moveLightbox(delta) {
  if (!lbList.length) return;
  lbIndex = (lbIndex + delta + lbList.length) % lbList.length;
  updateLightbox();
  if (slideshowTimer) armSlideshow();
}

function closeLightbox() {
  stopSlideshow();
  $("#lightbox").hidden = true;
  document.body.style.overflow = "";
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
}

function slideshowMs() {
  return Math.min(12, Math.max(2, Number(gallery?.presentationConfig?.interval || 5))) * 1000;
}

function armSlideshow() {
  clearTimeout(slideshowTimer);
  const bar = $("#lbProgress");
  const fill = bar.firstElementChild;
  bar.hidden = false;
  fill.style.transition = "none";
  fill.style.width = "0";
  requestAnimationFrame(() => requestAnimationFrame(() => {
    fill.style.transition = `width ${slideshowMs()}ms linear`;
    fill.style.width = "100%";
  }));
  slideshowTimer = setTimeout(() => moveLightbox(1), slideshowMs());
}

function startSlideshow(fromStart) {
  if (!photos.length) return;
  if (fromStart || $("#lightbox").hidden) openLightbox(visiblePhotos().length ? visiblePhotos() : photos, 0);
  setIcon($("#lbPlay"), "i-pause");
  $("#lightbox").requestFullscreen?.().catch(() => {});
  armSlideshow();
  metric("presentationStarts");
}

function stopSlideshow() {
  clearTimeout(slideshowTimer);
  slideshowTimer = null;
  $("#lbProgress").hidden = true;
  setIcon($("#lbPlay"), "i-play");
}

$("#heroSlideshowBtn").addEventListener("click", () => startSlideshow(true));
$("#barSlideshowBtn").addEventListener("click", () => startSlideshow(true));
$("#lbPlay").addEventListener("click", () => (slideshowTimer ? stopSlideshow() : startSlideshow(false)));
$("#lbClose").addEventListener("click", closeLightbox);
$("#lbPrev").addEventListener("click", () => moveLightbox(-1));
$("#lbNext").addEventListener("click", () => moveLightbox(1));
$("#lbFav").addEventListener("click", () => toggleFavorite(lbList[lbIndex]?.filename));
$("#lbNote").addEventListener("click", () => openNote(lbList[lbIndex]?.filename));
$("#lbDownload").addEventListener("click", () => downloadSingle(lbList[lbIndex]));

document.addEventListener("keydown", event => {
  if ($("#lightbox").hidden || document.querySelector("dialog[open]")) return;
  if (event.key === "Escape") closeLightbox();
  else if (event.key === "ArrowRight") moveLightbox(1);
  else if (event.key === "ArrowLeft") moveLightbox(-1);
  else if (event.key === " ") { event.preventDefault(); slideshowTimer ? stopSlideshow() : startSlideshow(false); }
});

let touchX = null;
$("#lbStage").addEventListener("touchstart", event => { touchX = event.changedTouches[0].clientX; }, { passive: true });
$("#lbStage").addEventListener("touchend", event => {
  if (touchX === null) return;
  const dx = event.changedTouches[0].clientX - touchX;
  touchX = null;
  if (Math.abs(dx) > 50) moveLightbox(dx < 0 ? 1 : -1);
}, { passive: true });

// Ochrona przed „Zapisz obraz jako” (o ile fotograf jej nie wyłączył).
document.addEventListener("contextmenu", event => {
  if (ui.blockSaveImage !== false && event.target.closest?.(".ph, .lb__stage, .g-hero")) event.preventDefault();
});

// ---------------------------------------------------------------- statystyki dla fotografa

function analyticsBase() {
  const uid = auth.currentUser?.uid;
  return uid ? `clientAnalytics/${slug}/${uid}` : "";
}

async function metric(name) {
  const base = analyticsBase();
  if (!base) return;
  try {
    await runTransaction(ref(db, `${base}/${name}`), current => Number(current || 0) + 1);
    if (name.endsWith("Downloads")) await runTransaction(ref(db, `${base}/downloadsTotal`), current => Number(current || 0) + 1);
    await update(ref(db, base), { lastActivityAt: Date.now() });
  } catch (error) {
    console.warn("ANALYTICS", name, error?.code || error);
  }
}

async function trackVisit() {
  const base = analyticsBase();
  if (!base) return;
  try {
    await runTransaction(ref(db, `${base}/visits`), current => Number(current || 0) + 1);
    await runTransaction(ref(db, `${base}/firstOpenedAt`), current => current || Date.now());
    await update(ref(db, base), { lastOpenedAt: Date.now(), lastActivityAt: Date.now(), userAgent: navigator.userAgent.slice(0, 220) });
  } catch (error) {
    console.warn("ANALYTICS visit", error?.code || error);
  }
}

function markViewed(filename) {
  const base = analyticsBase();
  if (!base || viewedThisSession.has(filename)) return;
  viewedThisSession.add(filename);
  runTransaction(ref(db, `${base}/viewed/${selectionKey(filename)}`), current => current || { filename, firstViewedAt: Date.now() }).catch(() => {});
}

let viewObserver;
function observeViews() {
  viewObserver ||= new IntersectionObserver(entries => entries.forEach(entry => {
    if (entry.isIntersecting) {
      markViewed(entry.target.dataset.filename);
      viewObserver.unobserve(entry.target);
    }
  }), { threshold: 0.6 });
  document.querySelectorAll("#grid .ph").forEach(card => {
    if (!viewedThisSession.has(card.dataset.filename)) viewObserver.observe(card);
  });
}

init();
