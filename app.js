import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getStorage, ref as sRef, listAll, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js";
import { getDatabase, ref, get, set, remove } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js?v=4";

const app = initializeApp(firebaseConfig);
const storage = getStorage(app);
const db = getDatabase(app);
const auth = getAuth(app);
const $ = s => document.querySelector(s);

const params = new URLSearchParams(location.search);
const galleryId = params.get("g") || "test-session";

let gallery = null;
let photos = [];
let currentIndex = 0;
let onlyFavorites = false;
let favorites = new Map();
let uid = null;

function b64url(str){
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  bytes.forEach(b => binary += String.fromCharCode(b));
  return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
async function sha256(text){
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
function selectionPath(filename){
  return `galleries/${galleryId}/selections/${uid}/${b64url(filename)}`;
}
function updateCounts(){
  $("#favCount").textContent = favorites.size;
  $("#selectedCount").textContent = favorites.size;
}

async function init(){
  try{
    const cred = await signInAnonymously(auth);
    uid = cred.user.uid;

    const snap = await get(ref(db, `galleries/${galleryId}/public`));
    if(!snap.exists()){
      $("#galleryNotFound").hidden = false;
      $("#passwordForm").hidden = true;
      return;
    }
    gallery = snap.val();

    if(gallery.active === false){
      $("#galleryNotFound").hidden = false;
      $("#passwordForm").hidden = true;
      return;
    }

    $("#lockTitle").textContent = gallery.title || "Galeria klienta";
    $("#galleryName").textContent = gallery.title || galleryId;
    $("#heroTitle").textContent = gallery.title || galleryId;
    $("#heroSubtitle").textContent = gallery.subtitle || "Wybierz swoje ulubione zdjęcia.";
    if(Number(gallery.maxFavorites || 0) > 0){
      $("#maxFavoritesLabel").textContent = ` / ${gallery.maxFavorites}`;
    }

    if(sessionStorage.getItem(`raf-access-${galleryId}`) === "1"){
      openGallery();
    }
  }catch(err){
    $("#galleryNotFound").hidden = false;
    $("#galleryNotFound").textContent = "Nie udało się połączyć z galerią: " + (err.message || err);
    $("#passwordForm").hidden = true;
  }
}

async function openGallery(){
  $("#lockScreen").hidden = true;
  $("#galleryView").hidden = false;
  await loadFavorites();
  await loadGalleryPhotos();
}

async function loadFavorites(){
  const snap = await get(ref(db, `galleries/${galleryId}/selections/${uid}`));
  favorites.clear();
  if(snap.exists()){
    const data = snap.val();
    Object.values(data || {}).forEach(v=>{
      if(v && v.filename) favorites.set(v.filename, v);
    });
  }
  updateCounts();
}

async function loadGalleryPhotos(){
  $("#loading").hidden = false;
  $("#storageError").hidden = true;

  try{
    const previewFolder = `galleries/${galleryId}/previews`;
    const originalFolder = `galleries/${galleryId}/originals`;
    const result = await listAll(sRef(storage, previewFolder));
    const items = [...result.items].sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));

    photos = await Promise.all(items.map(async item=>{
      const preview = await getDownloadURL(item);
      let original = preview;
      try { original = await getDownloadURL(sRef(storage, `${originalFolder}/${item.name}`)); } catch(_){}
      return {filename:item.name,preview,original};
    }));

    $("#photoCount").textContent = photos.length;
    $("#loading").hidden = true;
    render();
  }catch(err){
    $("#loading").hidden = true;
    $("#storageError").hidden = false;
    $("#storageError").textContent = `Błąd Firebase Storage: ${err.code || ""} ${err.message || ""}`;
  }
}

function render(){
  const shown = onlyFavorites ? photos.filter(p=>favorites.has(p.filename)) : photos;
  const grid = $("#grid");
  grid.innerHTML = "";

  if(!shown.length){
    grid.innerHTML = `<div class="empty">${onlyFavorites ? "Nie masz jeszcze ulubionych zdjęć." : "Brak zdjęć w tej galerii."}</div>`;
    return;
  }

  shown.forEach(photo=>{
    const index = photos.findIndex(p=>p.filename===photo.filename);
    const card = document.createElement("article");
    card.className = "photo-card";
    card.innerHTML = `
      <img loading="lazy" src="${photo.preview}" alt="${photo.filename}">
      <button class="fav-btn ${favorites.has(photo.filename)?"active":""}">${favorites.has(photo.filename)?"♥":"♡"}</button>
    `;
    card.querySelector("img").onclick = ()=>openLightbox(index);
    card.querySelector(".fav-btn").onclick = e=>{e.stopPropagation();toggleFavorite(photo.filename);};
    grid.appendChild(card);
  });
}

async function toggleFavorite(filename){
  if(favorites.has(filename)){
    await remove(ref(db, selectionPath(filename)));
    favorites.delete(filename);
  }else{
    const max = Number(gallery.maxFavorites || 0);
    if(max > 0 && favorites.size >= max){
      alert(`Możesz wybrać maksymalnie ${max} zdjęć.`);
      return;
    }
    const value = {filename, selectedAt: Date.now()};
    await set(ref(db, selectionPath(filename)), value);
    favorites.set(filename, value);
  }
  updateCounts();
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
  $("#lightboxCaption").textContent = `${currentIndex+1} / ${photos.length} · ${p.filename}`;
  $("#lightboxFav").textContent = favorites.has(p.filename) ? "♥ Ulubione" : "♡ Ulubione";
  $("#lightboxDownload").href = p.original;
  $("#lightboxDownload").style.display = gallery.downloadsEnabled === false ? "none" : "";
}
function closeLightbox(){
  $("#lightbox").hidden = true;
  document.body.style.overflow = "";
}

$("#passwordForm").addEventListener("submit", async e=>{
  e.preventDefault();
  const entered = $("#passwordInput").value;
  const hash = await sha256(entered);
  const ok = hash === gallery.passwordHash;
  $("#passwordError").hidden = ok;
  if(!ok) return;

  sessionStorage.setItem(`raf-access-${galleryId}`,"1");
  openGallery();
});

$("#logoutBtn").onclick = ()=>{
  sessionStorage.removeItem(`raf-access-${galleryId}`);
  location.reload();
};
$("#favoritesToggle").onclick = ()=>{
  onlyFavorites = !onlyFavorites;
  $("#favoritesToggle").innerHTML = `${onlyFavorites?"♥ Wszystkie":"♡ Ulubione"} <span id="favCount">${favorites.size}</span>`;
  render();
};
$("#closeLightbox").onclick = closeLightbox;
$("#prevPhoto").onclick = ()=>{if(photos.length){currentIndex=(currentIndex-1+photos.length)%photos.length;updateLightbox();}};
$("#nextPhoto").onclick = ()=>{if(photos.length){currentIndex=(currentIndex+1)%photos.length;updateLightbox();}};
$("#lightboxFav").onclick = ()=>toggleFavorite(photos[currentIndex].filename);

document.addEventListener("keydown",e=>{
  if($("#lightbox").hidden) return;
  if(e.key==="Escape") closeLightbox();
  if(e.key==="ArrowLeft") $("#prevPhoto").click();
  if(e.key==="ArrowRight") $("#nextPhoto").click();
});

init();
