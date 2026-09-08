import { getApps, getApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getDatabase, ref, get, update, onValue, runTransaction } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";

const slug = new URLSearchParams(location.search).get("g") || "";
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

let app;
let auth;
let db;
let uid = "";
let galleryPublic = null;
let analyticsStarted = false;
let presentationPhotos = [];
let presentationIndex = 0;
let presentationTimer = null;
let presentationPaused = false;
let observedPhotoKeys = new Set();
let approvalWatchBusy = false;

const STATUS_MAP = {
  waiting: { label: "Oczekuje na Twój wybór", icon: "○", tone: "neutral" },
  selected: { label: "Twój wybór został zapisany", icon: "✓", tone: "selected" },
  editing: { label: "Twoje zdjęcia są obecnie w obróbce", icon: "✦", tone: "editing" },
  ready: { label: "Zdjęcia są gotowe", icon: "✓", tone: "ready" },
  delivered: { label: "Galeria została dostarczona", icon: "✓", tone: "ready" }
};

function displayName(filename) {
  return String(filename || "").replace(/\.(jpe?g|png|webp)$/i, "");
}

function safeKey(value) {
  return btoa(unescape(encodeURIComponent(String(value || ""))))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function waitForApp() {
  for (let i = 0; i < 160; i++) {
    if (getApps().length) return getApp();
    await wait(25);
  }
  return null;
}

function waitForUser(authInstance) {
  if (authInstance.currentUser) return Promise.resolve(authInstance.currentUser);
  return new Promise(resolve => {
    let done = false;
    const stop = onAuthStateChanged(authInstance, user => {
      if (done || !user) return;
      done = true;
      clearTimeout(timer);
      stop();
      resolve(user);
    });
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      stop();
      resolve(null);
    }, 12000);
  });
}

function injectStyles() {
  if ($("#rafPremiumV18ClientStyles")) return;
  const style = document.createElement("style");
  style.id = "rafPremiumV18ClientStyles";
  style.textContent = `
    .raf-v18-status{max-width:var(--hero-max-width,1600px);margin:12px auto 0;padding:0 14px;box-sizing:border-box}
    .raf-v18-status-inner{display:flex;align-items:center;gap:10px;padding:11px 14px;border:1px solid #303036;border-radius:14px;background:#121216;color:#f4f4f2;box-shadow:0 8px 30px #0003}
    .raf-v18-status-icon{display:grid;place-items:center;width:27px;height:27px;border-radius:999px;background:#24242a;font-weight:900;flex:0 0 auto}
    .raf-v18-status-text{font-size:12px;font-weight:800;letter-spacing:.01em}
    .raf-v18-status[data-tone="editing"] .raf-v18-status-inner{border-color:#65511f;background:#18160f}.raf-v18-status[data-tone="editing"] .raf-v18-status-icon{background:#6e561c;color:#ffe59a}
    .raf-v18-status[data-tone="ready"] .raf-v18-status-inner{border-color:#245c3a;background:#0f1712}.raf-v18-status[data-tone="ready"] .raf-v18-status-icon{background:#1b7f46;color:#fff}
    .raf-v18-status[data-tone="selected"] .raf-v18-status-inner{border-color:#364b68;background:#10151c}.raf-v18-status[data-tone="selected"] .raf-v18-status-icon{background:#284e79;color:#fff}
    .raf-v18-comment{display:grid;gap:7px;margin-top:10px;padding-top:10px;border-top:1px solid #29292f}
    .raf-v18-comment label{font-size:11px;font-weight:800;color:#dedee3}.raf-v18-comment small{font-size:10px;color:#85858d}
    .raf-v18-comment textarea{width:100%;min-height:68px;resize:vertical;box-sizing:border-box;border:1px solid #34343a;border-radius:12px;background:#0e0e10;color:#f4f4f2;padding:10px 11px;font:500 12px system-ui;outline:none}.raf-v18-comment textarea:focus{border-color:#71717a}
    #premiumPresentationBtn{white-space:nowrap}
    .raf-v18-present{position:fixed;inset:0;z-index:100000;background:#050506;color:#fff;display:grid;grid-template-rows:auto 1fr auto}.raf-v18-present[hidden]{display:none!important}
    .raf-v18-present-bg{position:absolute;inset:-5%;background-size:cover;background-position:center;filter:blur(34px) brightness(.27) saturate(.75);transform:scale(1.06);z-index:0;transition:background-image .35s ease}
    .raf-v18-present-shade{position:absolute;inset:0;background:radial-gradient(circle at center,#0000 0,#0005 62%,#000b 100%);z-index:1;pointer-events:none}
    .raf-v18-present-top,.raf-v18-present-bottom,.raf-v18-present-stage{position:relative;z-index:2}
    .raf-v18-present-top{display:flex;align-items:center;gap:10px;padding:14px 18px}.raf-v18-present-top img{width:118px;height:auto}.raf-v18-present-top .spacer{flex:1}.raf-v18-present-count{font-size:12px;color:#b6b6bd}
    .raf-v18-present-close,.raf-v18-present-control{border:1px solid #ffffff26;background:#111116d9;color:#fff;border-radius:12px;min-width:42px;height:42px;padding:0 12px;font:800 13px system-ui;cursor:pointer;backdrop-filter:blur(12px)}
    .raf-v18-present-stage{display:grid;place-items:center;min-height:0;padding:0 5vw 10px}.raf-v18-present-stage img{max-width:100%;max-height:calc(100vh - 150px);object-fit:contain;border-radius:8px;box-shadow:0 28px 100px #000b;opacity:1;transition:opacity .18s ease}
    .raf-v18-present-bottom{display:flex;align-items:center;justify-content:center;gap:8px;padding:10px 14px 18px}.raf-v18-present-caption{min-width:180px;max-width:38vw;text-align:center;font-size:11px;color:#bcbcc4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.raf-v18-present-progress{position:absolute;left:0;right:0;bottom:0;height:3px;background:#ffffff14}.raf-v18-present-progress>i{display:block;height:100%;width:0;background:#fff;transition:width linear}
    @media(max-width:700px){.raf-v18-status{margin-top:8px;padding:0 8px}.raf-v18-status-inner{padding:9px 10px}.raf-v18-present-top{padding:10px}.raf-v18-present-top img{width:94px}.raf-v18-present-stage{padding:0 8px}.raf-v18-present-stage img{max-height:calc(100vh - 132px)}.raf-v18-present-caption{max-width:36vw;min-width:80px}.raf-v18-present-bottom{padding:8px 8px 14px}.raf-v18-present-control{min-width:38px;height:38px;padding:0 9px}}
  `;
  document.head.appendChild(style);
}

function injectStatus() {
  if ($("#rafPremiumV18Status")) return;
  const hero = $("#hero");
  if (!hero) return;
  hero.insertAdjacentHTML("afterend", `
    <section id="rafPremiumV18Status" class="raf-v18-status" data-tone="neutral">
      <div class="raf-v18-status-inner"><span class="raf-v18-status-icon">○</span><span class="raf-v18-status-text">Oczekuje na Twój wybór</span></div>
    </section>`);
}

function renderStatus(value) {
  injectStatus();
  const root = $("#rafPremiumV18Status");
  if (!root) return;
  const key = typeof value === "string" ? value : String(value?.key || "waiting");
  const item = STATUS_MAP[key] || STATUS_MAP.waiting;
  root.dataset.tone = item.tone;
  $(".raf-v18-status-icon", root).textContent = item.icon;
  $(".raf-v18-status-text", root).textContent = (typeof value === "object" && value?.label) ? value.label : item.label;
}

function injectCommentBox() {
  const workflow = $("#selectionWorkflow");
  if (!workflow || $("#selectionCommentInput")) return;
  const actions = $(".selection-workflow-actions", workflow);
  const box = document.createElement("div");
  box.className = "raf-v18-comment";
  box.innerHTML = `<label for="selectionCommentInput">Wiadomość do fotografa — opcjonalnie</label><textarea id="selectionCommentInput" maxlength="800" placeholder="Np. proszę o delikatny retusz, naturalne kolory albo inną uwagę do całego wyboru…"></textarea><small>Komentarz zostanie dopięty do zatwierdzonego wyboru.</small>`;
  workflow.insertBefore(box, actions || null);
  const input = $("#selectionCommentInput");
  const key = `raf-selection-comment:${slug}`;
  input.value = localStorage.getItem(key) || "";
  input.addEventListener("input", () => localStorage.setItem(key, input.value));
}

async function attachCommentToNewestApproval(comment, clickedAt) {
  if (!comment || approvalWatchBusy) return;
  approvalWatchBusy = true;
  try {
    for (let attempt = 0; attempt < 12; attempt++) {
      await wait(attempt === 0 ? 700 : 450);
      const snap = await get(ref(db, `approvals/${slug}`));
      const entries = Object.entries(snap.exists() ? (snap.val() || {}) : {})
        .filter(([,item]) => item && item.mode !== "rejected" && Number(item.submittedAt || 0) >= clickedAt - 1200)
        .sort((a,b) => Number(b[1].submittedAt || 0) - Number(a[1].submittedAt || 0));
      if (!entries.length) continue;
      const [id, item] = entries[0];
      if (item.comment === comment) break;
      await update(ref(db, `approvals/${slug}/${id}`), { comment, commentUpdatedAt: Date.now() });
      localStorage.removeItem(`raf-selection-comment:${slug}`);
      const input = $("#selectionCommentInput");
      if (input) input.value = "";
      break;
    }
  } catch (error) {
    console.warn("RAF v18 comment attach failed", error);
  } finally {
    approvalWatchBusy = false;
  }
}

function bindApprovalComment() {
  injectCommentBox();
  const btn = $("#approveSelectionBtn");
  if (!btn || btn.dataset.rafV18CommentBound) return;
  btn.dataset.rafV18CommentBound = "1";
  btn.addEventListener("click", () => {
    const comment = $("#selectionCommentInput")?.value?.trim() || "";
    if (!comment) return;
    attachCommentToNewestApproval(comment, Date.now());
  }, true);
}

function photoListFromPublic(pub) {
  return Object.values(pub?.photos || {})
    .filter(item => item?.previewUrl && item?.filename)
    .map(item => ({ filename: item.filename, previewUrl: item.previewUrl }));
}

function injectPresentation() {
  if (!$("#premiumPresentationBtn")) {
    const actions = $(".top-actions");
    if (actions) {
      const btn = document.createElement("button");
      btn.id = "premiumPresentationBtn";
      btn.type = "button";
      btn.className = "ghost";
      btn.textContent = "▣ Prezentacja";
      actions.insertBefore(btn, $("#shareBtn") || null);
      btn.addEventListener("click", startPresentation);
    }
  }
  if ($("#rafPremiumPresentation")) return;
  document.body.insertAdjacentHTML("beforeend", `
    <section id="rafPremiumPresentation" class="raf-v18-present" hidden aria-label="Tryb prezentacyjny">
      <div id="rafV18PresentBg" class="raf-v18-present-bg"></div><div class="raf-v18-present-shade"></div>
      <div class="raf-v18-present-top"><img src="logo-white.png" alt="RAF.studio"><span class="spacer"></span><span id="rafV18PresentCount" class="raf-v18-present-count">1 / 1</span><button id="rafV18PresentClose" class="raf-v18-present-close" type="button">×</button></div>
      <div class="raf-v18-present-stage"><img id="rafV18PresentImage" alt=""></div>
      <div class="raf-v18-present-bottom"><button id="rafV18PresentPrev" class="raf-v18-present-control" type="button">‹</button><button id="rafV18PresentPlay" class="raf-v18-present-control" type="button">❚❚</button><div id="rafV18PresentCaption" class="raf-v18-present-caption"></div><button id="rafV18PresentNext" class="raf-v18-present-control" type="button">›</button><div class="raf-v18-present-progress"><i id="rafV18PresentProgress"></i></div></div>
    </section>`);
  $("#rafV18PresentClose")?.addEventListener("click", stopPresentation);
  $("#rafV18PresentPrev")?.addEventListener("click", () => showPresentation(presentationIndex - 1, true));
  $("#rafV18PresentNext")?.addEventListener("click", () => showPresentation(presentationIndex + 1, true));
  $("#rafV18PresentPlay")?.addEventListener("click", togglePresentationPause);
}

function presentationIntervalMs() {
  const seconds = Number(galleryPublic?.presentationConfig?.interval || 5);
  return Math.min(12, Math.max(2, seconds)) * 1000;
}

function armPresentationTimer() {
  clearTimeout(presentationTimer);
  const bar = $("#rafV18PresentProgress");
  if (bar) {
    bar.style.transition = "none"; bar.style.width = "0";
    requestAnimationFrame(() => requestAnimationFrame(() => {
      bar.style.transition = `width ${presentationIntervalMs()}ms linear`;
      bar.style.width = presentationPaused ? "0" : "100%";
    }));
  }
  if (presentationPaused) return;
  presentationTimer = setTimeout(() => showPresentation(presentationIndex + 1), presentationIntervalMs());
}

function showPresentation(index, manual = false) {
  if (!presentationPhotos.length) return;
  presentationIndex = (index + presentationPhotos.length) % presentationPhotos.length;
  const item = presentationPhotos[presentationIndex];
  const img = $("#rafV18PresentImage");
  if (img) {
    img.style.opacity = ".12";
    const preload = new Image();
    preload.onload = () => { img.src = item.previewUrl; img.alt = displayName(item.filename); img.style.opacity = "1"; };
    preload.src = item.previewUrl;
  }
  const bg = $("#rafV18PresentBg");
  if (bg) bg.style.backgroundImage = `url("${String(item.previewUrl).replace(/"/g, "%22")}")`;
  if ($("#rafV18PresentCaption")) $("#rafV18PresentCaption").textContent = displayName(item.filename);
  if ($("#rafV18PresentCount")) $("#rafV18PresentCount").textContent = `${presentationIndex + 1} / ${presentationPhotos.length}`;
  if (manual) presentationPaused = false;
  if ($("#rafV18PresentPlay")) $("#rafV18PresentPlay").textContent = presentationPaused ? "▶" : "❚❚";
  armPresentationTimer();
}

async function startPresentation() {
  injectPresentation();
  presentationPhotos = photoListFromPublic(galleryPublic);
  if (!presentationPhotos.length) return;
  presentationPaused = false;
  presentationIndex = 0;
  const overlay = $("#rafPremiumPresentation");
  overlay.hidden = false;
  document.documentElement.style.overflow = "hidden";
  showPresentation(0);
  try { await overlay.requestFullscreen?.(); } catch (_) {}
  incrementMetric("presentationStarts");
}

function stopPresentation() {
  clearTimeout(presentationTimer);
  presentationTimer = null;
  const overlay = $("#rafPremiumPresentation");
  if (overlay) overlay.hidden = true;
  document.documentElement.style.overflow = "";
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
}

function togglePresentationPause() {
  presentationPaused = !presentationPaused;
  if ($("#rafV18PresentPlay")) $("#rafV18PresentPlay").textContent = presentationPaused ? "▶" : "❚❚";
  armPresentationTimer();
}

function bindPresentationKeyboard() {
  if (document.body.dataset.rafV18PresentationKeys) return;
  document.body.dataset.rafV18PresentationKeys = "1";
  document.addEventListener("keydown", event => {
    const overlay = $("#rafPremiumPresentation");
    if (!overlay || overlay.hidden) return;
    if (event.key === "Escape") stopPresentation();
    if (event.key === "ArrowRight") showPresentation(presentationIndex + 1, true);
    if (event.key === "ArrowLeft") showPresentation(presentationIndex - 1, true);
    if (event.key === " ") { event.preventDefault(); togglePresentationPause(); }
  });
}

function analyticsBase() {
  return uid ? `clientAnalytics/${slug}/${uid}` : "";
}

async function incrementMetric(name) {
  if (!db || !uid || !slug) return;
  try {
    await runTransaction(ref(db, `${analyticsBase()}/${name}`), current => Number(current || 0) + 1);
    await update(ref(db, analyticsBase()), { lastActivityAt: Date.now() });
  } catch (error) {
    if (String(error?.code || "").includes("PERMISSION_DENIED")) console.info("RAF analytics czeka na publikację nowych Database Rules.");
    else console.warn("RAF analytics metric failed", name, error);
  }
}

async function markGalleryVisit() {
  if (analyticsStarted || !uid || !db) return;
  analyticsStarted = true;
  const base = analyticsBase();
  try {
    await runTransaction(ref(db, `${base}/visits`), current => Number(current || 0) + 1);
    await runTransaction(ref(db, `${base}/firstOpenedAt`), current => current || Date.now());
    await update(ref(db, base), { lastOpenedAt: Date.now(), lastActivityAt: Date.now(), userAgent: navigator.userAgent.slice(0, 220) });
  } catch (error) {
    if (!String(error?.code || "").includes("PERMISSION_DENIED")) console.warn("RAF visit analytics failed", error);
  }
  installPhotoViewObserver();
}

function filenameFromCard(card) {
  return card?.dataset?.filename || card?.dataset?.file || card?.querySelector?.(".photo-name")?.textContent || card?.querySelector?.("figcaption")?.textContent || card?.querySelector?.("img")?.alt || "";
}

async function markPhotoViewed(filename) {
  if (!filename || observedPhotoKeys.has(filename)) return;
  observedPhotoKeys.add(filename);
  try {
    const key = safeKey(filename);
    await runTransaction(ref(db, `${analyticsBase()}/viewed/${key}`), current => current || { filename, firstViewedAt: Date.now() });
    await update(ref(db, analyticsBase()), { lastActivityAt: Date.now() });
  } catch (_) {}
}

function installPhotoViewObserver() {
  if ($("#grid")?.dataset.rafV18ViewObserver) return;
  const grid = $("#grid");
  if (!grid) return;
  grid.dataset.rafV18ViewObserver = "1";
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting && entry.intersectionRatio >= .55) {
        const filename = filenameFromCard(entry.target);
        if (filename) markPhotoViewed(filename);
      }
    });
  }, { threshold: [.55] });
  const observeCards = () => $$(".photo-card", grid).forEach(card => { if (!card.dataset.rafV18Observed) { card.dataset.rafV18Observed = "1"; observer.observe(card); } });
  new MutationObserver(observeCards).observe(grid, { childList:true, subtree:true });
  observeCards();
}

function bindDownloadAnalytics() {
  if (document.body.dataset.rafV18DownloadAnalytics) return;
  document.body.dataset.rafV18DownloadAnalytics = "1";
  document.addEventListener("click", event => {
    const target = event.target.closest?.("button,a");
    if (!target) return;
    const id = target.id || "";
    if (id === "downloadAllGalleryBtn") { incrementMetric("fullGalleryDownloads"); incrementMetric("downloadsTotal"); return; }
    if (id === "downloadFavoritesBtn" || id === "downloadFavoritesInlineBtn") { incrementMetric("favoriteDownloads"); incrementMetric("downloadsTotal"); return; }
    if (id === "downloadSelectedBtn") { incrementMetric("selectedDownloads"); incrementMetric("downloadsTotal"); return; }
    if (id === "lightboxDownload" || target.classList.contains("photo-download")) { incrementMetric("singleDownloads"); incrementMetric("downloadsTotal"); }
  }, true);
}

function watchGalleryEnter() {
  const view = $("#galleryView");
  if (!view) return;
  const check = () => { if (!view.hidden) markGalleryVisit(); };
  new MutationObserver(check).observe(view, { attributes:true, attributeFilter:["hidden"] });
  check();
}

async function init() {
  if (!slug) return;
  injectStyles();
  injectStatus();
  injectCommentBox();
  injectPresentation();
  bindPresentationKeyboard();
  bindDownloadAnalytics();

  app = await waitForApp();
  if (!app) return;
  auth = getAuth(app);
  const user = await waitForUser(auth);
  if (!user) return;
  uid = user.uid;
  db = getDatabase(app);

  try {
    const snap = await get(ref(db, `galleries/${slug}/public`));
    galleryPublic = snap.exists() ? (snap.val() || {}) : {};
    presentationPhotos = photoListFromPublic(galleryPublic);
  } catch (error) {
    console.warn("RAF v18 public gallery load failed", error);
    galleryPublic = {};
  }

  onValue(ref(db, `galleries/${slug}/public/workflowStatus`), snap => renderStatus(snap.exists() ? snap.val() : "waiting"), () => renderStatus("waiting"));
  bindApprovalComment();
  watchGalleryEnter();
}

init().catch(error => console.warn("RAF client premium v18 failed", error));
