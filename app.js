import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getStorage, ref, listAll, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js";
import { firebaseConfig, galleryConfig as cfg } from "./firebase-config.js?v=3";

const fbApp = initializeApp(firebaseConfig);
const storage = getStorage(fbApp);
const $ = s => document.querySelector(s);

let photos = [];
let currentIndex = 0;
let onlyFavorites = false;
const favKey = `raf-favorites-${cfg.id}`;
let favorites = new Set(JSON.parse(localStorage.getItem(favKey) || "[]"));

function saveFavorites(){
  localStorage.setItem(favKey, JSON.stringify([...favorites]));
  $("#favCount").textContent = favorites.size;
  $("#selectedCount").textContent = favorites.size;
}

async function loadGallery(){
  $("#loading").hidden = false;
  $("#storageError").hidden = true;

  try {
    const result = await listAll(ref(storage, cfg.previewFolder));
    const items = [...result.items].sort((a,b) =>
      a.name.localeCompare(b.name, undefined, {numeric:true})
    );

    photos = await Promise.all(items.map(async item => {
      const preview = await getDownloadURL(item);
      let original = preview;
      try {
        original = await getDownloadURL(ref(storage, `${cfg.originalFolder}/${item.name}`));
      } catch (_) {}
      return {
        id: item.fullPath,
        filename: item.name,
        preview,
        original
      };
    }));

    $("#photoCount").textContent = photos.length;
    $("#loading").hidden = true;
    render();
  } catch(err) {
    $("#loading").hidden = true;
    $("#storageError").hidden = false;
    $("#storageError").innerHTML = `<strong>Błąd Firebase</strong><br>${err.code || ""}<br>${err.message || ""}`;
  }
}

function render(){
  const visible = onlyFavorites ? photos.filter(p => favorites.has(p.id)) : photos;
  const grid = $("#grid");
  grid.innerHTML = "";

  if (!visible.length) {
    grid.innerHTML = `<div class="empty">${onlyFavorites ? "Nie wybrano jeszcze żadnych ulubionych zdjęć." : "Brak zdjęć w folderze previews."}</div>`;
    return;
  }

  for(const photo of visible){
    const index = photos.findIndex(p => p.id === photo.id);
    const card = document.createElement("article");
    card.className = "photo-card";
    card.innerHTML = `
      <img loading="lazy" src="${photo.preview}" alt="${photo.filename}">
      <button class="fav-btn ${favorites.has(photo.id) ? "active" : ""}">
        ${favorites.has(photo.id) ? "♥" : "♡"}
      </button>
    `;

    card.querySelector("img").addEventListener("click", () => openLightbox(index));
    card.querySelector(".fav-btn").addEventListener("click", e => {
      e.stopPropagation();
      toggleFavorite(photo.id);
    });
    grid.appendChild(card);
  }
}

function toggleFavorite(id){
  favorites.has(id) ? favorites.delete(id) : favorites.add(id);
  saveFavorites();
  render();
  if(!$("#lightbox").hidden) updateLightbox();
}

function openLightbox(index){
  currentIndex = index;
  $("#lightbox").hidden = false;
  document.body.style.overflow = "hidden";
  updateLightbox();
}

function updateLightbox(){
  const p = photos[currentIndex];
  $("#lightboxImage").src = p.original;
  $("#lightboxCaption").textContent = `${currentIndex + 1} / ${photos.length} · ${p.filename}`;
  $("#lightboxFav").textContent = favorites.has(p.id) ? "♥ Ulubione" : "♡ Ulubione";
  $("#lightboxDownload").href = p.original;
}

function closeLightbox(){
  $("#lightbox").hidden = true;
  document.body.style.overflow = "";
}

$("#passwordForm").addEventListener("submit", e => {
  e.preventDefault();
  const ok = $("#passwordInput").value === cfg.password;
  $("#passwordError").hidden = ok;
  if(!ok) return;

  sessionStorage.setItem(`raf-access-${cfg.id}`, "1");
  $("#lockScreen").hidden = true;
  $("#galleryView").hidden = false;
  loadGallery();
});

$("#logoutBtn").addEventListener("click", () => {
  sessionStorage.removeItem(`raf-access-${cfg.id}`);
  location.reload();
});

$("#favoritesToggle").addEventListener("click", () => {
  onlyFavorites = !onlyFavorites;
  $("#favoritesToggle").innerHTML =
    `${onlyFavorites ? "♥ Wszystkie" : "♡ Ulubione"} <span id="favCount">${favorites.size}</span>`;
  render();
});

$("#closeLightbox").onclick = closeLightbox;
$("#prevPhoto").onclick = () => {
  if(!photos.length) return;
  currentIndex = (currentIndex - 1 + photos.length) % photos.length;
  updateLightbox();
};
$("#nextPhoto").onclick = () => {
  if(!photos.length) return;
  currentIndex = (currentIndex + 1) % photos.length;
  updateLightbox();
};
$("#lightboxFav").onclick = () => toggleFavorite(photos[currentIndex].id);

document.addEventListener("keydown", e => {
  if($("#lightbox").hidden) return;
  if(e.key === "Escape") closeLightbox();
  if(e.key === "ArrowLeft") $("#prevPhoto").click();
  if(e.key === "ArrowRight") $("#nextPhoto").click();
});

saveFavorites();

if(sessionStorage.getItem(`raf-access-${cfg.id}`) === "1"){
  $("#lockScreen").hidden = true;
  $("#galleryView").hidden = false;
  loadGallery();
}