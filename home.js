import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getDatabase, ref, get } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js?v=17.1";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
const $ = selector => document.querySelector(selector);

const CACHE_KEY = "raf-client-zone-gallery-index-v17";
const AUTH_TIMEOUT = 8000;
const DATA_TIMEOUT = 10000;

let entries = [];
let legitModuleLoaded = false;

function escapeHtml(value){
  return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
}

function galleryHref(slug){
  const url = new URL("./", location.href);
  url.searchParams.set("g", slug);
  return url.toString();
}

function withTimeout(promise, ms, label){
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} — przekroczono ${Math.round(ms / 1000)} s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function loadLegitModule(){
  if (legitModuleLoaded) return;
  legitModuleLoaded = true;
  import("./home-legit-v16.6.js?v=17.1").catch(error => {
    console.warn("HOME LEGIT MODULE ERROR", error);
  });
}

function applyClientZoneConfig(raw){
  const blurPercent = Math.max(0, Math.min(100, Number(raw?.coverBlur ?? 50) || 0));
  const blurPx = (blurPercent * 0.4).toFixed(1);
  document.documentElement.style.setProperty("--zone-cover-blur", `${blurPx}px`);
}

function normalizeEntries(data){
  return Object.entries(data || {})
    .map(([key, value]) => ({ slug: value?.slug || key, ...value }))
    .filter(item => item.slug && item.title && item.enabled !== false && item.homeHidden !== true)
    .sort((a,b) => {
      const orderA = Number.isFinite(Number(a.homeOrder)) ? Number(a.homeOrder) : 999999;
      const orderB = Number.isFinite(Number(b.homeOrder)) ? Number(b.homeOrder) : 999999;
      return orderA - orderB || String(a.title).localeCompare(String(b.title), "pl", {numeric:true,sensitivity:"base"});
    });
}

function render(){
  const search = $("#gallerySearch");
  const q = search ? search.value.trim().toLowerCase() : "";
  const visible = entries.filter(item => String(item.title || item.slug).toLowerCase().includes(q));

  const count = $("#galleryCount");
  if (count) count.textContent = `${visible.length} ${visible.length === 1 ? "galeria" : "galerii"}`;

  const container = $("#galleryDirectory");
  if (!container) return;

  container.innerHTML = visible.map(item => {
    const title = escapeHtml(item.title || item.slug || "Galeria");
    const cover = String(item.coverUrl || "").replace(/"/g, "%22");
    return `
      <a class="gallery-entry" href="${galleryHref(item.slug)}" aria-label="Otwórz galerię ${title}">
        <div class="gallery-entry-cover"${cover ? ` style="background-image:url(&quot;${cover}&quot;)"` : ""}></div>
        <span class="gallery-entry-arrow">→</span>
        <div class="gallery-entry-content">
          <small>PRYWATNA GALERIA</small>
          <h2>${title}</h2>
        </div>
      </a>`;
  }).join("");

  container.hidden = visible.length === 0;
  const empty = $("#homeEmpty");
  if (empty) empty.hidden = visible.length !== 0;
}

function showCachedEntries(){
  try{
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    if (!cached?.data) return false;
    entries = normalizeEntries(cached.data);
    if (!entries.length) return false;
    const loading = $("#homeLoading");
    if (loading) loading.hidden = true;
    render();
    return true;
  }catch(_){
    return false;
  }
}

function showHomeError(error, hadCache){
  console.error("CLIENT ZONE HOME ERROR", error);
  const loading = $("#homeLoading");
  if (loading) loading.hidden = true;

  if (hadCache) return;

  const errorBox = $("#homeError");
  if (errorBox) {
    errorBox.hidden = false;
    const detail = errorBox.querySelector("span");
    if (detail) detail.textContent = `Nie udało się połączyć z Firebase. ${error?.code || error?.message || "Spróbuj ponownie."}`;
  }
  const count = $("#galleryCount");
  if (count) count.textContent = "—";
}

async function ensureAuth(){
  if (auth.currentUser) return auth.currentUser;
  const credential = await withTimeout(signInAnonymously(auth), AUTH_TIMEOUT, "Logowanie Firebase");
  return credential.user;
}

async function init(){
  const hadCache = showCachedEntries();

  try{
    await ensureAuth();

    // Moduł stopki / polityki ładuje się dopiero PO zalogowaniu,
    // więc nie uruchamia drugiego signInAnonymously równolegle.
    loadLegitModule();

    const [indexSnap, configSnap] = await withTimeout(Promise.all([
      get(ref(db, "galleries/__system__/public/galleryIndex")),
      get(ref(db, "galleries/__system__/public/clientZoneConfig")).catch(() => null)
    ]), DATA_TIMEOUT, "Pobieranie listy galerii");

    applyClientZoneConfig(configSnap?.exists?.() ? configSnap.val() : null);

    const data = indexSnap.exists() ? indexSnap.val() : {};
    entries = normalizeEntries(data);

    try{
      localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), data }));
    }catch(_){ }

    const loading = $("#homeLoading");
    if (loading) loading.hidden = true;
    const errorBox = $("#homeError");
    if (errorBox) errorBox.hidden = true;
    render();
  }catch(error){
    // Nawet po błędzie ładujemy wygląd strony z domyślną konfiguracją,
    // aby użytkownik nie widział martwego ekranu.
    loadLegitModule();
    showHomeError(error, hadCache);
  }
}

$("#gallerySearch")?.addEventListener("input", render);
init();
