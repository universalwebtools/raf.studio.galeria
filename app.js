import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth,signInAnonymously } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getDatabase,ref,get,set,remove,update } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";
import { getStorage,ref as sRef,getDownloadURL } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js";
import { firebaseConfig } from "./firebase-config.js?v=8";

const fb=initializeApp(firebaseConfig),auth=getAuth(fb),db=getDatabase(fb),storage=getStorage(fb),$=s=>document.querySelector(s);
const slug=new URLSearchParams(location.search).get("g")||"test-session";
let uid=null,gallery=null,photos=[],favorites=new Map(),current=0,filter="all",meta=null,touchX=0;

async function hash(text){const d=new TextEncoder().encode(text),h=await crypto.subtle.digest("SHA-256",d);return [...new Uint8Array(h)].map(b=>b.toString(16).padStart(2,"0")).join("")}
function key(name){const b=new TextEncoder().encode(name);let s="";b.forEach(x=>s+=String.fromCharCode(x));return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")}
function toast(msg){const t=$("#toast");t.textContent=msg;t.hidden=false;clearTimeout(t._t);t._t=setTimeout(()=>t.hidden=true,1800)}
function maxFav(){return Number(gallery?.maxFavorites||0)}
function locked(){return !!(gallery?.lockAfterSubmit&&meta?.submittedAt)}
function expired(){return gallery?.expiresAt&&new Date(gallery.expiresAt+"T23:59:59")<new Date()}

async function init(){
  try{
    uid=(await signInAnonymously(auth)).user.uid;
    const s=await get(ref(db,`galleries/${slug}/public`));
    if(!s.exists())return fail("Galeria nie istnieje.");
    gallery=s.val();
    if(gallery.active===false||expired())return fail("Galeria wygasła lub została wyłączona.");

    $("#lockTitle").textContent=gallery.title||"Galeria klienta";
    $("#heroTitle").textContent=gallery.title||slug;
    $("#heroSubtitle").textContent=gallery.subtitle||"Wybierz swoje ulubione zdjęcia.";
    if(gallery.expiresAt)$("#expiryLabel").textContent=`Dostęp do ${gallery.expiresAt}`;
    if(maxFav()>0){$("#maxFavoritesLabel").textContent=` / ${maxFav()}`;$("#dockLimit").textContent=` / ${maxFav()}`;$("#progressWrap").hidden=false}
    if(gallery.selectionEnabled===false){$("#favoritesToggle").hidden=true;$("#favFilter").hidden=true}

    if(sessionStorage.getItem(`raf-access-${slug}`)==="1")openGallery();
  }catch(e){fail("Nie udało się połączyć z galerią.")}
}
function fail(m){$("#galleryNotFound").hidden=false;$("#galleryNotFound").textContent=m;$("#passwordForm").hidden=true}

async function openGallery(){
  $("#lockScreen").hidden=true;
  $("#galleryView").hidden=false;
  await loadSelection();
  loadManifestInstant();
  updateUI();
}
async function loadSelection(){
  const s=await get(ref(db,`galleries/${slug}/selections/${uid}`));
  favorites.clear();meta=null;
  if(s.exists()){
    const d=s.val()||{};
    Object.values(d.items||{}).forEach(v=>{if(v?.filename)favorites.set(v.filename,v)});
    meta=d.meta||null;
  }
}

/* v10:
   ZERO listAll() po stronie klienta.
   ZERO getDownloadURL() dla previews podczas wejścia.
   Gotowe adresy preview są już zapisane przez panel w gallery.photos.
*/
function loadManifestInstant(){
  $("#loading").hidden=true;
  $("#storageError").hidden=true;

  const manifest=gallery.photos||{};
  photos=Object.values(manifest)
    .filter(x=>x&&x.filename&&x.previewUrl)
    .sort((a,b)=>a.filename.localeCompare(b.filename,undefined,{numeric:true}))
    .map(x=>({
      filename:x.filename,
      preview:x.previewUrl,
      original:null,
      originalPath:x.originalPath||`galleries/${slug}/originals/${x.filename}`
    }));

  $("#photoCountHero").textContent=`${photos.length} zdjęć`;

  if(!photos.length){
    $("#storageError").hidden=false;
    $("#storageError").innerHTML="Galeria nie ma jeszcze szybkiego indeksu zdjęć. Fotograf powinien w panelu kliknąć <strong>⚡ Odbuduj indeks</strong>.";
    return;
  }

  const cover=photos.find(p=>p.filename===gallery.coverFile)||photos[0];
  if(cover)$("#hero").style.backgroundImage=`url("${cover.preview}")`;

  render();
}
function render(){
  const shown=filter==="favorites"?photos.filter(p=>favorites.has(p.filename)):photos;
  const grid=$("#grid");grid.innerHTML="";

  shown.forEach(p=>{
    const idx=photos.findIndex(x=>x.filename===p.filename);
    const card=document.createElement("article");card.className="photo-card";
    card.innerHTML=`<div class="photo-skeleton"></div><img loading="lazy" src="${p.preview}" alt=""><button type="button" class="photo-fav ${favorites.has(p.filename)?"active":""}" data-filename="${p.filename.replaceAll('"','&quot;')}" aria-label="Dodaj do wybranych" aria-pressed="${favorites.has(p.filename)?"true":"false"}" ${gallery.selectionEnabled===false?"hidden":""}>${favorites.has(p.filename)?"♥":"♡"}</button>`;
    const img=card.querySelector("img");img.onload=()=>{img.classList.add("loaded");card.classList.add("is-loaded")};if(img.complete&&img.naturalWidth>0){img.classList.add("loaded");card.classList.add("is-loaded")}img.onclick=()=>openLightbox(idx);
    const f=card.querySelector(".photo-fav");
    if(f){
      f.addEventListener("click",e=>{
        e.preventDefault();
        e.stopPropagation();
        toggleFav(p.filename,f);
      });
    }
    grid.appendChild(card);
  });

  if(filter==="favorites"&&!shown.length)grid.innerHTML='<div class="notice">Nie masz jeszcze wybranych zdjęć.</div>';
  updateUI();
}
async function toggleFav(name, button=null){
  if(gallery.selectionEnabled===false){
    toast("Wybieranie zdjęć jest wyłączone dla tej galerii.");
    return;
  }
  if(locked()){
    toast("Wybór został już zatwierdzony.");
    return;
  }

  const wasSelected = favorites.has(name);

  if(!wasSelected && maxFav()>0 && favorites.size>=maxFav()){
    toast(`Limit: ${maxFav()} zdjęć`);
    return;
  }

  // OPTIMISTYCZNIE: serce zmienia się natychmiast, bez czekania na Firebase.
  if(wasSelected){
    favorites.delete(name);
  }else{
    favorites.set(name,{filename:name,selectedAt:Date.now()});
  }

  updateUI();
  updateHeartVisuals(name);

  if(button) button.classList.add("is-saving");

  try{
    if(wasSelected){
      await remove(ref(db,`galleries/${slug}/selections/${uid}/items/${key(name)}`));
    }else{
      await set(
        ref(db,`galleries/${slug}/selections/${uid}/items/${key(name)}`),
        favorites.get(name)
      );
    }

    if(meta?.submittedAt&&!gallery.lockAfterSubmit){
      meta.submittedAt=null;
      await update(
        ref(db,`galleries/${slug}/selections/${uid}/meta`),
        {submittedAt:null,updatedAt:Date.now()}
      );
    }
  }catch(err){
    // Cofnij zmianę, jeśli Firebase odrzuci zapis.
    if(wasSelected){
      favorites.set(name,{filename:name,selectedAt:Date.now()});
    }else{
      favorites.delete(name);
    }
    updateUI();
    updateHeartVisuals(name);

    console.error("Błąd zapisu ulubionego:", err);
    toast(`Nie zapisano wyboru: ${err.code || err.message || "błąd Firebase"}`);
  }finally{
    if(button) button.classList.remove("is-saving");
  }
}

function updateHeartVisuals(name){
  document.querySelectorAll(".photo-fav").forEach(btn=>{
    if(btn.dataset.filename===name){
      const selected=favorites.has(name);
      btn.classList.toggle("active",selected);
      btn.textContent=selected?"♥":"♡";
      btn.setAttribute("aria-pressed", selected ? "true" : "false");
    }
  });

  if(!$("#lightbox").hidden && photos[current]?.filename===name){
    $("#lightboxFav").textContent=favorites.has(name)?"♥":"♡";
  }
}

function updateUI(){
  const n=favorites.size;
  $("#favCount").textContent=n;$("#selectedCount").textContent=n;$("#dockCount").textContent=n;
  if(maxFav()>0){$("#selectProgress").style.width=`${Math.min(100,n/maxFav()*100)}%`;$("#progressText").textContent=`${n} z ${maxFav()} wybranych`}
  $("#selectionDock").hidden=gallery?.selectionEnabled===false||n===0;
  $("#submitSelectionBtn").textContent=meta?.submittedAt?"Wybór zatwierdzony ✓":"Zatwierdź wybór";
  $("#submitSelectionBtn").disabled=locked();
  $("#dockHint").textContent=meta?.submittedAt?(locked()?"Wybór jest zamknięty.":"Zmiana zdjęcia cofnie zatwierdzenie."):"Wybór zapisuje się automatycznie.";
}

async function ensureOriginal(i){
  const p=photos[i];if(!p)return null;if(p.original)return p.original;
  try{p.original=await getDownloadURL(sRef(storage,p.originalPath))}catch(_){p.original=p.preview}
  return p.original;
}
async function openLightbox(i){
  current=i;$("#lightbox").hidden=false;document.body.style.overflow="hidden";
  const p=photos[i];$("#lightboxImage").src=p.preview;updateLightboxUI();
  const url=await ensureOriginal(i);if(current===i&&url)$("#lightboxImage").src=url;
}
function updateLightboxUI(){
  const p=photos[current];if(!p)return;
  $("#lightboxCaption").textContent=`${current+1} / ${photos.length} · ${p.filename}`;
  $("#lightboxFav").textContent=favorites.has(p.filename)?"♥":"♡";
  $("#lightboxDownload").hidden=gallery.downloadsEnabled===false;
  if(p.original)$("#lightboxDownload").href=p.original;
}
async function go(i){
  current=(i+photos.length)%photos.length;
  const p=photos[current];$("#lightboxImage").src=p.preview;updateLightboxUI();
  const url=await ensureOriginal(current);if(url)$("#lightboxImage").src=url;
}
function closeLightbox(){$("#lightbox").hidden=true;document.body.style.overflow=""}

$("#passwordForm").onsubmit=async e=>{e.preventDefault();const ok=(await hash($("#passwordInput").value))===gallery.passwordHash;$("#passwordError").hidden=ok;if(ok){sessionStorage.setItem(`raf-access-${slug}`,"1");openGallery()}};
$("#allFilter").onclick=()=>{filter="all";$("#allFilter").classList.add("active");$("#favFilter").classList.remove("active");render()};
$("#favFilter").onclick=()=>{filter="favorites";$("#favFilter").classList.add("active");$("#allFilter").classList.remove("active");render()};
$("#favoritesToggle").onclick=()=>$("#favFilter").click();
$("#shareBtn").onclick=async()=>{try{if(navigator.share)await navigator.share({title:gallery.title,url:location.href});else{await navigator.clipboard.writeText(location.href);toast("Link skopiowany")}}catch(_){}};
$("#logoutBtn").onclick=()=>{sessionStorage.removeItem(`raf-access-${slug}`);location.reload()};
$("#closeLightbox").onclick=closeLightbox;
$("#prevPhoto").onclick=()=>go(current-1);
$("#nextPhoto").onclick=()=>go(current+1);
$("#lightboxFav").onclick=(e)=>{e.preventDefault();e.stopPropagation();toggleFav(photos[current].filename,$("#lightboxFav"))};
$("#lightboxDownload").onclick=async e=>{if(!photos[current].original){e.preventDefault();const u=await ensureOriginal(current);if(u)window.open(u,"_blank")}};
document.addEventListener("keydown",e=>{if($("#lightbox").hidden)return;if(e.key==="Escape")closeLightbox();if(e.key==="ArrowLeft")$("#prevPhoto").click();if(e.key==="ArrowRight")$("#nextPhoto").click()});
$("#lightbox").addEventListener("touchstart",e=>touchX=e.changedTouches[0].clientX,{passive:true});
$("#lightbox").addEventListener("touchend",e=>{const d=e.changedTouches[0].clientX-touchX;if(Math.abs(d)>60)(d>0?$("#prevPhoto"):$("#nextPhoto")).click()},{passive:true});
$("#submitSelectionBtn").onclick=()=>{if(meta?.clientName)$("#clientNameInput").value=meta.clientName;if(meta?.note)$("#clientNoteInput").value=meta.note;$("#submitDialog").showModal()};
$("#closeSubmitDialog").onclick=$("#cancelSubmitBtn").onclick=()=>$("#submitDialog").close();
$("#confirmSubmitBtn").onclick=async()=>{const m={clientName:$("#clientNameInput").value.trim(),note:$("#clientNoteInput").value.trim(),submittedAt:Date.now(),updatedAt:Date.now()};await set(ref(db,`galleries/${slug}/selections/${uid}/meta`),m);meta=m;$("#submitDialog").close();$("#submittedDialog").showModal();updateUI()};
$("#closeSubmittedBtn").onclick=()=>$("#submittedDialog").close();
init();