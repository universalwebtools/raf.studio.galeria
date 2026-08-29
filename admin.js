import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getDatabase, ref, get, set, update, remove } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";
import { firebaseConfig, ADMIN_UID } from "./firebase-config.js?v=4";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
const $ = s => document.querySelector(s);

let galleries = {};

async function sha256(text){
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,"0")).join("");
}

function cleanSlug(value){
  return value.trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[^a-z0-9-]+/g,"-")
    .replace(/^-+|-+$/g,"")
    .replace(/-+/g,"-");
}

onAuthStateChanged(auth, user=>{
  if(user && user.uid === ADMIN_UID){
    $("#adminLogin").hidden = true;
    $("#adminPanel").hidden = false;
    loadGalleries();
  }else{
    $("#adminLogin").hidden = false;
    $("#adminPanel").hidden = true;
    if(user && user.uid !== ADMIN_UID) signOut(auth);
  }
});

$("#adminLoginForm").addEventListener("submit",async e=>{
  e.preventDefault();
  $("#adminLoginError").hidden = true;
  try{
    const cred = await signInWithEmailAndPassword(auth,$("#adminEmail").value,$("#adminPassword").value);
    if(cred.user.uid !== ADMIN_UID){
      await signOut(auth);
      throw new Error("To konto nie ma uprawnień administratora.");
    }
  }catch(err){
    $("#adminLoginError").hidden = false;
    $("#adminLoginError").textContent = err.message || String(err);
  }
});

$("#adminLogoutBtn").onclick = ()=>signOut(auth);

async function loadGalleries(){
  const snap = await get(ref(db,"galleries"));
  galleries = snap.exists() ? snap.val() : {};
  renderGalleries();
}

function selectionSummary(g){
  const selections = g.selections || {};
  let total = 0;
  const unique = new Set();
  for(const entries of Object.values(selections)){
    for(const item of Object.values(entries || {})){
      if(item?.filename){ total++; unique.add(item.filename); }
    }
  }
  return {total, unique:unique.size, clients:Object.keys(selections).length};
}

function galleryUrl(slug){
  return `${location.origin}${location.pathname.replace(/admin\.html.*$/,"")}?g=${encodeURIComponent(slug)}`;
}

function renderGalleries(){
  const list = $("#galleryList");
  list.innerHTML = "";
  const entries = Object.entries(galleries);

  if(!entries.length){
    list.innerHTML = `<div class="empty">Nie masz jeszcze żadnej galerii. Kliknij „+ Nowa galeria”.</div>`;
    return;
  }

  entries.sort((a,b)=>(b[1]?.public?.createdAt||0)-(a[1]?.public?.createdAt||0));

  for(const [slug,g] of entries){
    const pub = g.public || {};
    const sum = selectionSummary(g);
    const card = document.createElement("article");
    card.className = "admin-card";
    card.innerHTML = `
      <h3>${escapeHtml(pub.title || slug)}</h3>
      <div class="meta">
        <div>Slug: <strong>${escapeHtml(slug)}</strong></div>
        <div>Klienci: <strong>${sum.clients}</strong></div>
        <div>Zaznaczenia: <strong>${sum.total}</strong> · unikalne: <strong>${sum.unique}</strong></div>
        <div>Limit: <strong>${Number(pub.maxFavorites||0)===0 ? "bez limitu" : pub.maxFavorites}</strong></div>
      </div>
      <div class="pill ${pub.active===false?"off":""}">${pub.active===false?"Wyłączona":"Aktywna"}</div>
      <div class="card-actions">
        <button data-edit="${slug}" class="ghost">Edytuj</button>
        <button data-selection="${slug}" class="ghost">♥ Wybory</button>
        <button data-copy="${slug}" class="ghost">Kopiuj link</button>
        <a class="button-link copy-link" href="${galleryUrl(slug)}" target="_blank">Otwórz</a>
      </div>
    `;
    list.appendChild(card);
  }

  list.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>openEdit(b.dataset.edit));
  list.querySelectorAll("[data-selection]").forEach(b=>b.onclick=()=>openSelections(b.dataset.selection));
  list.querySelectorAll("[data-copy]").forEach(b=>b.onclick=async()=>{
    await navigator.clipboard.writeText(galleryUrl(b.dataset.copy));
    b.textContent="Skopiowano ✓";
    setTimeout(()=>b.textContent="Kopiuj link",1200);
  });
}

function escapeHtml(s){
  return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
}

function resetForm(){
  $("#editingSlug").value="";
  $("#galleryTitleInput").value="";
  $("#gallerySlugInput").value="";
  $("#galleryPasswordInput").value="";
  $("#gallerySubtitleInput").value="";
  $("#maxFavoritesInput").value="0";
  $("#downloadsEnabledInput").checked=true;
  $("#galleryActiveInput").checked=true;
  $("#deleteGalleryBtn").hidden=true;
  $("#gallerySlugInput").disabled=false;
}

$("#newGalleryBtn").onclick=()=>{
  resetForm();
  $("#dialogTitle").textContent="Nowa galeria";
  $("#galleryDialog").showModal();
};

function openEdit(slug){
  const g = galleries[slug] || {};
  const pub = g.public || {};
  resetForm();
  $("#dialogTitle").textContent="Edytuj galerię";
  $("#editingSlug").value=slug;
  $("#galleryTitleInput").value=pub.title||"";
  $("#gallerySlugInput").value=slug;
  $("#gallerySlugInput").disabled=true;
  $("#galleryPasswordInput").value="";
  $("#gallerySubtitleInput").value=pub.subtitle||"";
  $("#maxFavoritesInput").value=Number(pub.maxFavorites||0);
  $("#downloadsEnabledInput").checked=pub.downloadsEnabled!==false;
  $("#galleryActiveInput").checked=pub.active!==false;
  $("#deleteGalleryBtn").hidden=false;
  $("#galleryDialog").showModal();
}

$("#galleryForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const editing = $("#editingSlug").value;
  const slug = editing || cleanSlug($("#gallerySlugInput").value);
  if(!slug){ alert("Podaj poprawny slug."); return; }

  const existing = galleries[slug]?.public || {};
  const password = $("#galleryPasswordInput").value;
  let passwordHash = existing.passwordHash || "";
  if(password) passwordHash = await sha256(password);

  if(!passwordHash){
    alert("Dla nowej galerii ustaw hasło.");
    return;
  }

  const data = {
    title: $("#galleryTitleInput").value.trim() || slug,
    subtitle: $("#gallerySubtitleInput").value.trim(),
    passwordHash,
    maxFavorites: Number($("#maxFavoritesInput").value || 0),
    downloadsEnabled: $("#downloadsEnabledInput").checked,
    active: $("#galleryActiveInput").checked,
    createdAt: existing.createdAt || Date.now(),
    updatedAt: Date.now()
  };

  await set(ref(db,`galleries/${slug}/public`),data);
  $("#galleryDialog").close();
  await loadGalleries();
});

$("#deleteGalleryBtn").onclick=async()=>{
  const slug=$("#editingSlug").value;
  if(!slug) return;
  if(!confirm(`Usunąć galerię "${slug}" z bazy? Zdjęcia w Storage NIE zostaną usunięte.`)) return;
  await remove(ref(db,`galleries/${slug}`));
  $("#galleryDialog").close();
  await loadGalleries();
};

function openSelections(slug){
  const g = galleries[slug] || {};
  const selections = g.selections || {};
  $("#selectionTitle").textContent = `${g.public?.title || slug} — wybory`;

  const wrap = $("#selectionContent");
  wrap.innerHTML = "";

  const clients = Object.entries(selections);
  if(!clients.length){
    wrap.innerHTML = `<div class="empty">Klient nie zaznaczył jeszcze żadnych zdjęć.</div>`;
  }else{
    for(const [clientUid,entries] of clients){
      const items = Object.values(entries || {}).filter(v=>v?.filename).sort((a,b)=>a.filename.localeCompare(b.filename,undefined,{numeric:true}));
      const group = document.createElement("section");
      group.className="selection-group";
      group.innerHTML = `
        <h4>Klient ${escapeHtml(clientUid.slice(0,8))}… — ${items.length} zdjęć</h4>
        <div class="selection-list">
          ${items.map(x=>`<div class="selection-item">${escapeHtml(x.filename)}</div>`).join("")}
        </div>
      `;
      wrap.appendChild(group);
    }
  }
  $("#selectionDialog").showModal();
}

$("#closeDialogBtn").onclick=()=>$("#galleryDialog").close();
$("#cancelDialogBtn").onclick=()=>$("#galleryDialog").close();
$("#closeSelectionBtn").onclick=()=>$("#selectionDialog").close();
