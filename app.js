import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth,signInAnonymously } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getDatabase,ref,get,set,remove,update } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";
import { getStorage,ref as sRef,listAll,getDownloadURL } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js";
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
async function openGallery(){$("#lockScreen").hidden=true;$("#galleryView").hidden=false;await loadSelection();await loadPhotos();updateUI()}
async function loadSelection(){const s=await get(ref(db,`galleries/${slug}/selections/${uid}`));favorites.clear();meta=null;if(s.exists()){const d=s.val()||{};Object.values(d.items||{}).forEach(v=>{if(v?.filename)favorites.set(v.filename,v)});meta=d.meta||null}}
async function loadPhotos(){
  $("#loading").hidden=false;
  try{
    const r=await listAll(sRef(storage,`galleries/${slug}/previews`));
    const items=[...r.items].sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));
    photos=await Promise.all(items.map(async i=>{const preview=await getDownloadURL(i);let original=preview;if(gallery.downloadsEnabled!==false){try{original=await getDownloadURL(sRef(storage,`galleries/${slug}/originals/${i.name}`))}catch(_){}}return{filename:i.name,preview,original}}));
    $("#photoCountHero").textContent=`${photos.length} zdjęć`;
    const cover=photos.find(p=>p.filename===gallery.coverFile)||photos[0];if(cover)$("#hero").style.backgroundImage=`url("${cover.preview}")`;
    render();
  }catch(e){$("#storageError").hidden=false;$("#storageError").textContent=`Błąd zdjęć: ${e.code||""} ${e.message||e}`}
  finally{$("#loading").hidden=true}
}
function render(){
  const shown=filter==="favorites"?photos.filter(p=>favorites.has(p.filename)):photos,grid=$("#grid");grid.innerHTML="";
  for(const p of shown){
    const idx=photos.findIndex(x=>x.filename===p.filename),card=document.createElement("article");card.className="photo-card";
    card.innerHTML=`<img loading="lazy" src="${p.preview}" alt=""><button class="photo-fav ${favorites.has(p.filename)?"active":""}" ${gallery.selectionEnabled===false?"hidden":""}>${favorites.has(p.filename)?"♥":"♡"}</button>`;
    const img=card.querySelector("img");img.onload=()=>img.classList.add("loaded");img.onclick=()=>openLightbox(idx);
    const f=card.querySelector(".photo-fav");if(f)f.onclick=e=>{e.stopPropagation();toggleFav(p.filename)};
    grid.appendChild(card);
  }
  if(filter==="favorites"&&!shown.length)grid.innerHTML='<div class="notice">Nie masz jeszcze wybranych zdjęć.</div>';
  updateUI();
}
async function toggleFav(name){
  if(gallery.selectionEnabled===false)return;
  if(locked())return toast("Wybór został już zatwierdzony.");
  if(favorites.has(name)){await remove(ref(db,`galleries/${slug}/selections/${uid}/items/${key(name)}`));favorites.delete(name)}
  else{if(maxFav()>0&&favorites.size>=maxFav())return toast(`Limit: ${maxFav()} zdjęć`);const v={filename:name,selectedAt:Date.now()};await set(ref(db,`galleries/${slug}/selections/${uid}/items/${key(name)}`),v);favorites.set(name,v)}
  if(meta?.submittedAt&&!gallery.lockAfterSubmit){meta.submittedAt=null;await update(ref(db,`galleries/${slug}/selections/${uid}/meta`),{submittedAt:null,updatedAt:Date.now()})}
  render();if(!$("#lightbox").hidden)updateLightbox();
}
function updateUI(){
  const n=favorites.size;$("#favCount").textContent=n;$("#selectedCount").textContent=n;$("#dockCount").textContent=n;
  if(maxFav()>0){$("#selectProgress").style.width=`${Math.min(100,n/maxFav()*100)}%`;$("#progressText").textContent=`${n} z ${maxFav()} wybranych`}
  $("#selectionDock").hidden=gallery?.selectionEnabled===false||n===0;
  $("#submitSelectionBtn").textContent=meta?.submittedAt?"Wybór zatwierdzony ✓":"Zatwierdź wybór";
  $("#submitSelectionBtn").disabled=locked();
  $("#dockHint").textContent=meta?.submittedAt?(locked()?"Wybór jest zamknięty.":"Zmiana zdjęcia cofnie zatwierdzenie."):"Wybór zapisuje się automatycznie.";
}
function openLightbox(i){current=i;$("#lightbox").hidden=false;document.body.style.overflow="hidden";updateLightbox()}
function updateLightbox(){const p=photos[current];if(!p)return;$("#lightboxImage").src=p.original;$("#lightboxCaption").textContent=`${current+1} / ${photos.length} · ${p.filename}`;$("#lightboxFav").textContent=favorites.has(p.filename)?"♥":"♡";$("#lightboxDownload").href=p.original;$("#lightboxDownload").hidden=gallery.downloadsEnabled===false}
function closeLightbox(){$("#lightbox").hidden=true;document.body.style.overflow=""}

$("#passwordForm").onsubmit=async e=>{e.preventDefault();const ok=(await hash($("#passwordInput").value))===gallery.passwordHash;$("#passwordError").hidden=ok;if(ok){sessionStorage.setItem(`raf-access-${slug}`,"1");openGallery()}};
$("#allFilter").onclick=()=>{filter="all";$("#allFilter").classList.add("active");$("#favFilter").classList.remove("active");render()};
$("#favFilter").onclick=()=>{filter="favorites";$("#favFilter").classList.add("active");$("#allFilter").classList.remove("active");render()};
$("#favoritesToggle").onclick=()=>$("#favFilter").click();
$("#shareBtn").onclick=async()=>{try{if(navigator.share)await navigator.share({title:gallery.title,url:location.href});else{await navigator.clipboard.writeText(location.href);toast("Link skopiowany")}}catch(_){}};
$("#logoutBtn").onclick=()=>{sessionStorage.removeItem(`raf-access-${slug}`);location.reload()};
$("#closeLightbox").onclick=closeLightbox;
$("#prevPhoto").onclick=()=>{current=(current-1+photos.length)%photos.length;updateLightbox()};
$("#nextPhoto").onclick=()=>{current=(current+1)%photos.length;updateLightbox()};
$("#lightboxFav").onclick=()=>toggleFav(photos[current].filename);
document.addEventListener("keydown",e=>{if($("#lightbox").hidden)return;if(e.key==="Escape")closeLightbox();if(e.key==="ArrowLeft")$("#prevPhoto").click();if(e.key==="ArrowRight")$("#nextPhoto").click()});
$("#lightbox").addEventListener("touchstart",e=>touchX=e.changedTouches[0].clientX,{passive:true});
$("#lightbox").addEventListener("touchend",e=>{const d=e.changedTouches[0].clientX-touchX;if(Math.abs(d)>60)(d>0?$("#prevPhoto"):$("#nextPhoto")).click()},{passive:true});
$("#submitSelectionBtn").onclick=()=>{if(meta?.clientName)$("#clientNameInput").value=meta.clientName;if(meta?.note)$("#clientNoteInput").value=meta.note;$("#submitDialog").showModal()};
$("#closeSubmitDialog").onclick=$("#cancelSubmitBtn").onclick=()=>$("#submitDialog").close();
$("#confirmSubmitBtn").onclick=async()=>{const m={clientName:$("#clientNameInput").value.trim(),note:$("#clientNoteInput").value.trim(),submittedAt:Date.now(),updatedAt:Date.now()};await set(ref(db,`galleries/${slug}/selections/${uid}/meta`),m);meta=m;$("#submitDialog").close();$("#submittedDialog").showModal();updateUI()};
$("#closeSubmittedBtn").onclick=()=>$("#submittedDialog").close();
init();