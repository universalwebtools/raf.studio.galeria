import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getDatabase, ref, get, set, remove } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";
import { getStorage, ref as sRef, uploadBytes, listAll } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js";
import { firebaseConfig, ADMIN_UID } from "./firebase-config.js?v=6";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
const storage = getStorage(app);
const $ = s => document.querySelector(s);

let galleries = {};
let uploadSlug = null;
let createdSlug = null;

async function sha256(text){
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
function cleanSlug(value){
  return value.trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[^a-z0-9-]+/g,"-")
    .replace(/^-+|-+$/g,"").replace(/-+/g,"-");
}
function escapeHtml(s){
  return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
}
function galleryUrl(slug){
  const base = location.href.replace(/admin\.html.*$/,"");
  return `${base}?g=${encodeURIComponent(slug)}`;
}
function showMessage(el,text,type="ok"){
  el.hidden=false;
  el.className=`admin-message ${type}`;
  el.textContent=text;
}
function hideMessage(el){el.hidden=true;}

onAuthStateChanged(auth,user=>{
  if(user && user.uid===ADMIN_UID){
    $("#adminLogin").hidden=true;
    $("#adminPanel").hidden=false;
    loadGalleries();
  }else{
    $("#adminLogin").hidden=false;
    $("#adminPanel").hidden=true;
    if(user && user.uid!==ADMIN_UID) signOut(auth);
  }
});

$("#adminLoginForm").addEventListener("submit",async e=>{
  e.preventDefault();
  $("#adminLoginError").hidden=true;
  try{
    const cred=await signInWithEmailAndPassword(auth,$("#adminEmail").value,$("#adminPassword").value);
    if(cred.user.uid!==ADMIN_UID){
      await signOut(auth);
      throw new Error("To konto nie ma uprawnień administratora.");
    }
  }catch(err){
    $("#adminLoginError").hidden=false;
    $("#adminLoginError").textContent=err.message||String(err);
  }
});
$("#adminLogoutBtn").onclick=()=>signOut(auth);

async function loadGalleries(){
  hideMessage($("#globalMessage"));
  try{
    const snap=await get(ref(db,"galleries"));
    galleries=snap.exists()?snap.val():{};
    renderGalleries(); // render immediately, no Storage wait
    refreshPhotoCounts(); // counts later
  }catch(err){
    showMessage($("#globalMessage"),"Nie mogę odczytać galerii: "+(err.message||err),"error");
  }
}

function selectionSummary(g){
  const selections=(g && g.selections)||{};
  let total=0;
  for(const entries of Object.values(selections)){
    for(const item of Object.values(entries||{})){
      if(item?.filename) total++;
    }
  }
  return {total,clients:Object.keys(selections).length};
}

function renderGalleries(){
  const list=$("#galleryList");
  list.innerHTML="";
  const entries=Object.entries(galleries||{});

  if(!entries.length){
    list.innerHTML='<div class="empty">Nie masz jeszcze galerii. Kliknij „+ Nowa galeria”.</div>';
    return;
  }

  entries.sort((a,b)=>(b[1]?.public?.createdAt||0)-(a[1]?.public?.createdAt||0));

  for(const [slug,gRaw] of entries){
    const g=gRaw||{};
    const pub=g.public||{};
    const sum=selectionSummary(g);
    const card=document.createElement("article");
    card.className="admin-card";
    card.dataset.slug=slug;
    card.innerHTML=`
      <h3>${escapeHtml(pub.title||slug)}</h3>
      <div class="meta">
        <div>Slug: <strong>${escapeHtml(slug)}</strong></div>
        <div>Zdjęcia: <strong class="photo-count">...</strong></div>
        <div>Klienci: <strong>${sum.clients}</strong></div>
        <div>Zaznaczenia: <strong>${sum.total}</strong></div>
        <div>Limit: <strong>${Number(pub.maxFavorites||0)===0?"bez limitu":pub.maxFavorites}</strong></div>
      </div>
      <div class="pill ${pub.active===false?"off":""}">${pub.active===false?"Wyłączona":"Aktywna"}</div>

      <div class="gallery-link">
        <input value="${galleryUrl(slug)}" readonly>
        <button class="ghost" data-copy="${slug}">Kopiuj</button>
      </div>

      <div class="card-actions">
        <button data-upload="${slug}">+ Dodaj zdjęcia</button>
        <button data-edit="${slug}" class="ghost">Edytuj</button>
        <button data-selection="${slug}" class="ghost">♥ Wybory</button>
        <a class="button-link" href="${galleryUrl(slug)}" target="_blank">Otwórz</a>
      </div>`;
    list.appendChild(card);
  }

  list.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>openEdit(b.dataset.edit));
  list.querySelectorAll("[data-upload]").forEach(b=>b.onclick=()=>openUpload(b.dataset.upload));
  list.querySelectorAll("[data-selection]").forEach(b=>b.onclick=()=>openSelections(b.dataset.selection));
  list.querySelectorAll("[data-copy]").forEach(b=>b.onclick=async()=>{
    await navigator.clipboard.writeText(galleryUrl(b.dataset.copy));
    b.textContent="Skopiowano ✓";
    setTimeout(()=>b.textContent="Kopiuj",1200);
  });
}

async function refreshPhotoCounts(){
  const cards=[...document.querySelectorAll(".admin-card[data-slug]")];
  for(const card of cards){
    const slug=card.dataset.slug;
    let count=0;
    try{
      const result=await listAll(sRef(storage,`galleries/${slug}/previews`));
      count=result.items.length;
    }catch(_){}
    const target=card.querySelector(".photo-count");
    if(target) target.textContent=count;
  }
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
  hideMessage($("#saveStatus"));
}
$("#newGalleryBtn").onclick=()=>{
  resetForm();
  $("#dialogTitle").textContent="Nowa galeria";
  $("#galleryDialog").showModal();
};

function openEdit(slug){
  const pub=galleries[slug]?.public||{};
  resetForm();
  $("#dialogTitle").textContent="Edytuj galerię";
  $("#editingSlug").value=slug;
  $("#galleryTitleInput").value=pub.title||"";
  $("#gallerySlugInput").value=slug;
  $("#gallerySlugInput").disabled=true;
  $("#gallerySubtitleInput").value=pub.subtitle||"";
  $("#maxFavoritesInput").value=Number(pub.maxFavorites||0);
  $("#downloadsEnabledInput").checked=pub.downloadsEnabled!==false;
  $("#galleryActiveInput").checked=pub.active!==false;
  $("#deleteGalleryBtn").hidden=false;
  $("#galleryDialog").showModal();
}

$("#galleryForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const btn=$("#saveGalleryBtn");
  btn.disabled=true;btn.textContent="Zapisywanie…";
  hideMessage($("#saveStatus"));

  try{
    const editing=$("#editingSlug").value;
    const slug=editing||cleanSlug($("#gallerySlugInput").value);
    if(!slug) throw new Error("Podaj poprawny adres / slug.");

    const existing=galleries[slug]?.public||{};
    const password=$("#galleryPasswordInput").value;
    let passwordHash=existing.passwordHash||"";
    if(password) passwordHash=await sha256(password);
    if(!passwordHash) throw new Error("Dla nowej galerii ustaw hasło klienta.");

    const data={
      title:$("#galleryTitleInput").value.trim()||slug,
      subtitle:$("#gallerySubtitleInput").value.trim(),
      passwordHash,
      maxFavorites:Number($("#maxFavoritesInput").value||0),
      downloadsEnabled:$("#downloadsEnabledInput").checked,
      active:$("#galleryActiveInput").checked,
      createdAt:existing.createdAt||Date.now(),
      updatedAt:Date.now()
    };

    await set(ref(db,`galleries/${slug}/public`),data);

    // immediate local update so card appears even before reread
    galleries[slug]=galleries[slug]||{};
    galleries[slug].public=data;
    renderGalleries();
    refreshPhotoCounts();

    $("#galleryDialog").close();

    if(!editing){
      createdSlug=slug;
      $("#createdLink").value=galleryUrl(slug);
      $("#createdDialog").showModal();
    }else{
      showMessage($("#globalMessage"),`Galeria „${data.title}” została zaktualizowana.`,"ok");
    }
  }catch(err){
    showMessage($("#saveStatus"),"Nie udało się zapisać: "+(err.message||err),"error");
  }finally{
    btn.disabled=false;btn.textContent="Zapisz";
  }
});

$("#deleteGalleryBtn").onclick=async()=>{
  const slug=$("#editingSlug").value;
  if(!slug||!confirm(`Usunąć galerię "${slug}" z bazy? Zdjęcia w Storage pozostaną.`)) return;
  try{
    await remove(ref(db,`galleries/${slug}`));
    delete galleries[slug];
    $("#galleryDialog").close();
    renderGalleries();
  }catch(err){
    showMessage($("#saveStatus"),err.message||String(err),"error");
  }
};

$("#copyCreatedLink").onclick=async()=>{
  await navigator.clipboard.writeText($("#createdLink").value);
  $("#copyCreatedLink").textContent="Skopiowano ✓";
  setTimeout(()=>$("#copyCreatedLink").textContent="Kopiuj link",1200);
};
$("#openGalleryNowBtn").onclick=()=>{
  if(createdSlug) window.open(galleryUrl(createdSlug),"_blank");
};
$("#addPhotosNowBtn").onclick=()=>{
  if(!createdSlug) return;
  $("#createdDialog").close();
  openUpload(createdSlug);
};

function openUpload(slug){
  uploadSlug=slug;
  $("#uploadTitle").textContent=`Dodaj zdjęcia — ${galleries[slug]?.public?.title||slug}`;
  $("#photoFilesInput").value="";
  $("#uploadProgress").style.width="0%";
  $("#uploadFileCount").textContent="0 plików";
  $("#uploadSize").textContent="0 MB";
  hideMessage($("#uploadStatus"));
  $("#uploadDialog").showModal();
}

$("#photoFilesInput").addEventListener("change",()=>{
  const files=[...$("#photoFilesInput").files];
  const bytes=files.reduce((sum,f)=>sum+f.size,0);
  $("#uploadFileCount").textContent=`${files.length} plików`;
  $("#uploadSize").textContent=`${(bytes/1024/1024).toFixed(1)} MB`;
});

async function makePreview(file,maxSide=2200,quality=.82){
  const bitmap=await createImageBitmap(file);
  let w=bitmap.width,h=bitmap.height;
  const scale=Math.min(1,maxSide/Math.max(w,h));
  w=Math.round(w*scale);h=Math.round(h*scale);
  const canvas=document.createElement("canvas");
  canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext("2d",{alpha:false});
  ctx.drawImage(bitmap,0,0,w,h);
  bitmap.close();
  return await new Promise((resolve,reject)=>{
    canvas.toBlob(blob=>blob?resolve(blob):reject(new Error("Nie udało się utworzyć podglądu.")),"image/jpeg",quality);
  });
}

$("#startUploadBtn").onclick=async()=>{
  const files=[...$("#photoFilesInput").files];
  if(!uploadSlug||!files.length){
    showMessage($("#uploadStatus"),"Najpierw wybierz zdjęcia JPG.","error");
    return;
  }

  const btn=$("#startUploadBtn");
  btn.disabled=true;btn.textContent="Wysyłanie…";

  try{
    for(let i=0;i<files.length;i++){
      const file=files[i];
      if(!/image\/jpe?g/i.test(file.type)) throw new Error(`${file.name} nie jest JPG/JPEG.`);

      showMessage($("#uploadStatus"),`${i+1}/${files.length}: ${file.name} — wysyłam oryginał…`);

      await uploadBytes(
        sRef(storage,`galleries/${uploadSlug}/originals/${file.name}`),
        file,
        {contentType:"image/jpeg"}
      );

      showMessage($("#uploadStatus"),`${i+1}/${files.length}: ${file.name} — tworzę podgląd…`);

      const preview=await makePreview(file);
      await uploadBytes(
        sRef(storage,`galleries/${uploadSlug}/previews/${file.name}`),
        preview,
        {contentType:"image/jpeg"}
      );

      $("#uploadProgress").style.width=`${Math.round(((i+1)/files.length)*100)}%`;
    }

    showMessage($("#uploadStatus"),`Gotowe — dodano ${files.length} zdjęć.`,"ok");
    refreshPhotoCounts();
  }catch(err){
    showMessage($("#uploadStatus"),"Błąd uploadu: "+(err.message||err),"error");
  }finally{
    btn.disabled=false;btn.textContent="Wyślij zdjęcia";
  }
};

function openSelections(slug){
  const g=galleries[slug]||{};
  const selections=g.selections||{};
  $("#selectionTitle").textContent=`${g.public?.title||slug} — wybory`;

  const wrap=$("#selectionContent");
  wrap.innerHTML="";
  const clients=Object.entries(selections);

  if(!clients.length){
    wrap.innerHTML='<div class="empty">Klient nie zaznaczył jeszcze żadnych zdjęć.</div>';
  }else{
    for(const [clientUid,entries] of clients){
      const items=Object.values(entries||{})
        .filter(v=>v?.filename)
        .sort((a,b)=>a.filename.localeCompare(b.filename,undefined,{numeric:true}));

      const group=document.createElement("section");
      group.className="selection-group";
      group.innerHTML=`
        <h4>Klient ${escapeHtml(clientUid.slice(0,8))}… — ${items.length} zdjęć</h4>
        <div class="selection-list">
          ${items.map(x=>`<div class="selection-item">${escapeHtml(x.filename)}</div>`).join("")}
        </div>`;
      wrap.appendChild(group);
    }
  }
  $("#selectionDialog").showModal();
}

$("#closeDialogBtn").onclick=()=>$("#galleryDialog").close();
$("#cancelDialogBtn").onclick=()=>$("#galleryDialog").close();
$("#closeCreatedBtn").onclick=()=>$("#createdDialog").close();
$("#closeUploadBtn").onclick=()=>$("#uploadDialog").close();
$("#cancelUploadBtn").onclick=()=>$("#uploadDialog").close();
$("#closeSelectionBtn").onclick=()=>$("#selectionDialog").close();
