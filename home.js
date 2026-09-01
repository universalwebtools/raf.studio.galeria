import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getDatabase, ref, get } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js?v=17.0";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
const $ = selector => document.querySelector(selector);

let entries = [];

function escapeHtml(value){
  return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
}

function galleryHref(slug){
  const url = new URL("./", location.href);
  url.searchParams.set("g", slug);
  return url.toString();
}

function applyClientZoneConfig(raw){
  const blurPercent = Math.max(0, Math.min(100, Number(raw?.coverBlur ?? 50) || 0));
  const blurPx = (blurPercent * 0.4).toFixed(1);
  document.documentElement.style.setProperty("--zone-cover-blur", `${blurPx}px`);
}

function render(){
  const q = $("#gallerySearch").value.trim().toLowerCase();
  const visible = entries.filter(item => String(item.title || item.slug).toLowerCase().includes(q));
  $("#galleryCount").textContent = `${visible.length} ${visible.length === 1 ? "galeria" : "galerii"}`;

  const container = $("#galleryDirectory");
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
  $("#homeEmpty").hidden = visible.length !== 0;
}

async function init(){
  try{
    await signInAnonymously(auth);
    const [indexSnap, configSnap] = await Promise.all([
      get(ref(db, "galleries/__system__/public/galleryIndex")),
      get(ref(db, "galleries/__system__/public/clientZoneConfig")).catch(() => null)
    ]);

    applyClientZoneConfig(configSnap?.exists?.() ? configSnap.val() : null);

    const data = indexSnap.exists() ? indexSnap.val() : {};
    entries = Object.entries(data || {})
      .map(([key, value]) => ({ slug: value?.slug || key, ...value }))
      .filter(item => item.slug && item.title && item.enabled !== false && item.homeHidden !== true)
      .sort((a,b) => {
        const orderA = Number.isFinite(Number(a.homeOrder)) ? Number(a.homeOrder) : 999999;
        const orderB = Number.isFinite(Number(b.homeOrder)) ? Number(b.homeOrder) : 999999;
        return orderA - orderB || String(a.title).localeCompare(String(b.title), "pl", {numeric:true,sensitivity:"base"});
      });

    $("#homeLoading").hidden = true;
    render();
  }catch(error){
    console.error("CLIENT ZONE HOME ERROR", error);
    $("#homeLoading").hidden = true;
    $("#homeError").hidden = false;
    $("#galleryCount").textContent = "—";
  }
}

$("#gallerySearch").addEventListener("input", render);
init();
