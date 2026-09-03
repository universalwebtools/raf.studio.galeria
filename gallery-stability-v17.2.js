import { getApps, getApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getDatabase, ref, get } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";

const slug = new URLSearchParams(location.search).get("g") || "";
const byFilename = new Map();
const byPreviewUrl = new Map();
let metadataReady = false;

function normalizeUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value, location.href);
    url.searchParams.delete("v");
    url.searchParams.delete("cache");
    url.searchParams.delete("t");
    return url.toString();
  } catch (_) {
    return String(value);
  }
}

function cleanFilename(value) {
  return String(value || "")
    .trim()
    .replace(/^.*[\\/]/, "")
    .replace(/\.webp$/i, "")
    .toLowerCase();
}

function metaRatio(item) {
  const width = Number(item?.width);
  const height = Number(item?.height);
  if (width > 0 && height > 0) return { width, height };

  const orientation = String(item?.orientation || "").toLowerCase();
  if (orientation.includes("portrait") || orientation.includes("pion")) return { width: 2, height: 3 };
  if (orientation.includes("landscape") || orientation.includes("poziom")) return { width: 3, height: 2 };
  if (orientation.includes("square") || orientation.includes("kwadrat")) return { width: 1, height: 1 };
  return null;
}

function addMeta(item) {
  if (!item) return;
  const ratio = metaRatio(item);
  if (!ratio) return;

  const meta = { ...ratio, filename: item.filename || "", previewUrl: item.previewUrl || "" };
  if (item.filename) {
    byFilename.set(cleanFilename(item.filename), meta);
    byFilename.set(cleanFilename(String(item.filename).replace(/\.[^.]+$/, "")), meta);
  }
  if (item.previewUrl) byPreviewUrl.set(normalizeUrl(item.previewUrl), meta);
}

async function waitForApp() {
  for (let i = 0; i < 160; i++) {
    if (getApps().length) return getApp();
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  return null;
}

function waitForUser(auth) {
  if (auth.currentUser) return Promise.resolve(auth.currentUser);
  return new Promise(resolve => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      unsub();
      resolve(null);
    }, 12000);
    const unsub = onAuthStateChanged(auth, user => {
      if (done || !user) return;
      done = true;
      clearTimeout(timer);
      unsub();
      resolve(user);
    });
  });
}

function filenameCandidates(card, img) {
  const values = [
    card?.dataset?.filename,
    card?.dataset?.file,
    card?.dataset?.photo,
    img?.dataset?.filename,
    img?.dataset?.file,
    img?.alt,
    img?.title,
    card?.querySelector?.(".photo-name")?.textContent,
    card?.querySelector?.(".photo-caption")?.textContent,
    card?.querySelector?.("figcaption")?.textContent
  ];
  return values.filter(Boolean).map(cleanFilename);
}

function findMeta(card, img) {
  const src = normalizeUrl(img?.currentSrc || img?.src || "");
  if (src && byPreviewUrl.has(src)) return byPreviewUrl.get(src);

  for (const candidate of filenameCandidates(card, img)) {
    if (byFilename.has(candidate)) return byFilename.get(candidate);
    const noExt = candidate.replace(/\.[^.]+$/, "");
    if (byFilename.has(noExt)) return byFilename.get(noExt);
  }
  return null;
}

function applyRatio(card) {
  if (!card || card.dataset.rafRatioReady === "1") return;
  const img = card.querySelector("img");
  if (!img) return;

  let meta = findMeta(card, img);
  if (!meta && img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
    meta = { width: img.naturalWidth, height: img.naturalHeight };
  }
  if (!meta) return;

  const width = Number(meta.width);
  const height = Number(meta.height);
  if (!(width > 0 && height > 0)) return;

  card.dataset.rafRatioReady = "1";
  card.style.setProperty("--raf-photo-ratio", `${width} / ${height}`);

  img.setAttribute("width", String(Math.round(width)));
  img.setAttribute("height", String(Math.round(height)));
  img.style.aspectRatio = `${width} / ${height}`;
  img.style.minHeight = "0";
  img.dataset.rafRatioReady = "1";

  const skeleton = card.querySelector(".photo-skeleton");
  if (skeleton) {
    skeleton.style.aspectRatio = `${width} / ${height}`;
    skeleton.style.minHeight = "0";
  }
}

function applyAllRatios() {
  if (!metadataReady) return;
  document.querySelectorAll("#grid .photo-card").forEach(applyRatio);
}

function installObserver() {
  const grid = document.getElementById("grid");
  if (!grid) return;

  const observer = new MutationObserver(() => {
    applyAllRatios();
  });
  observer.observe(grid, { childList: true, subtree: true });
  applyAllRatios();
}

function installStyles() {
  if (document.getElementById("rafGalleryStabilityStyles")) return;
  const style = document.createElement("style");
  style.id = "rafGalleryStabilityStyles";
  style.textContent = `
    #grid .photo-card[data-raf-ratio-ready="1"] img{
      width:100% !important;
      height:auto !important;
      min-height:0 !important;
      aspect-ratio:var(--raf-photo-ratio) !important;
    }
    #grid .photo-card[data-raf-ratio-ready="1"]{
      contain:layout paint;
    }
    @media (prefers-reduced-motion: reduce){
      #grid .photo-card img{transition:opacity .12s !important;}
    }
  `;
  document.head.appendChild(style);
}

async function init() {
  if (!slug) return;
  installStyles();
  installObserver();

  try {
    const app = await waitForApp();
    if (!app) return;
    const auth = getAuth(app);
    const user = await waitForUser(auth);
    if (!user) return;

    const db = getDatabase(app);
    const snap = await get(ref(db, `galleries/${slug}/public/photos`));
    Object.values(snap.exists() ? (snap.val() || {}) : {}).forEach(addMeta);
    metadataReady = true;
    applyAllRatios();
  } catch (error) {
    console.warn("RAF gallery stability metadata unavailable", error);
    metadataReady = true;
    applyAllRatios();
  }
}

init();
