import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth,onAuthStateChanged,signInWithEmailAndPassword,signOut } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getDatabase,ref,set,remove,update,onValue } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";
import { getStorage,ref as sRef,listAll,getDownloadURL,uploadBytesResumable,deleteObject } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js";
import { firebaseConfig,ADMIN_UID } from "./firebase-config.js?v=8";

const fb=initializeApp(firebaseConfig),auth=getAuth(fb),db=getDatabase(fb),storage=getStorage(fb),$=s=>document.querySelector(s);
let galleries={},uploadSlug=null,createdSlug=null;

const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const slugify=v=>v.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9-]+/g,"-").replace(/^-+|-+$/g,"").replace(/-+/g,"-");
async function hash(text){const d=new TextEncoder().encode(text),h=await crypto.subtle.digest("SHA-256",d);return [...new Uint8Array(h)].map(b=>b.toString(16).padStart(2,"0")).join("")}
const galleryUrl=s=>location.href.replace(/admin\.html.*$/,"")+`?g=${encodeURIComponent(s)}`;
function toast(m){const t=$("#toast");t.textContent=m;t.hidden=false;clearTimeout(t._t);t._t=setTimeout(()=>t.hidden=true,1800)}
function notice(el,m,type="ok"){el.hidden=false;el.className=`notice ${type}`;el.textContent=m}
function fmt(ts){return ts?new Date(ts).toLocaleString("pl-PL"):"—"}
function originalNameFromPreview(name){return name.toLowerCase().endsWith(".webp")?name.slice(0,-5):name}
function manifestKey(name){
  const b=new TextEncoder().encode(name);let s="";
  b.forEach(x=>s+=String.fromCharCode(x));
  return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}

onAuthStateChanged(auth,u=>{
  if(u&&u.uid===ADMIN_UID){
    $("#adminLogin").hidden=true;$("#adminPanel").hidden=false;$("#adminEmailLabel").textContent=u.email||"Administrator";
    onValue(ref(db,"galleries"),s=>{galleries=s.exists()?s.val():{};renderAll()});
  }else{$("#adminLogin").hidden=false;$("#adminPanel").hidden=true;if(u&&u.uid!==ADMIN_UID)signOut(auth)}
});
$("#adminLoginForm").onsubmit=async e=>{e.preventDefault();$("#adminLoginError").hidden=true;try{const c=await signInWithEmailAndPassword(auth,$("#adminEmail").value,$("#adminPassword").value);if(c.user.uid!==ADMIN_UID)throw new Error("Brak uprawnień administratora.")}catch(err){$("#adminLoginError").hidden=false;$("#adminLoginError").textContent=err.message||err}};
$("#adminLogoutBtn").onclick=()=>signOut(auth);

function summary(g){const s=g?.selections||{};let clients=0,submitted=0;for(const x of Object.values(s)){if(Object.keys(x?.items||{}).length)clients++;if(x?.meta?.submittedAt)submitted++}return{clients,submitted}}
function renderAll(){
  const all=Object.values(galleries);let photos=0,sel=0,sub=0;all.forEach(g=>{photos+=Number(g?.public?.photoCount||0);const s=summary(g);sel+=s.clients;sub+=s.submitted});
  $("#statGalleries").textContent=all.length;$("#statPhotos").textContent=photos;$("#statSelections").textContent=sel;$("#statSubmitted").textContent=sub;renderCards()
}
function filtered(){
  const q=$("#gallerySearch").value.trim().toLowerCase(),st=$("#galleryStatusFilter").value;
  return Object.entries(galleries).filter(([slug,g])=>{
    const p=g?.public||{},s=summary(g),m=!q||(p.title||"").toLowerCase().includes(q)||slug.includes(q);
    const ok=st==="all"||(st==="active"&&p.active!==false)||(st==="inactive"&&p.active===false)||(st==="submitted"&&s.submitted>0);
    return m&&ok
  }).sort((a,b)=>(b[1]?.public?.createdAt||0)-(a[1]?.public?.createdAt||0))
}
function renderCards(){
  const list=$("#galleryList");list.innerHTML="";
  const rows=filtered();if(!rows.length){list.innerHTML='<div class="notice">Brak galerii pasujących do filtra.</div>';return}
  rows.forEach(([slug,g])=>{
    const p=g.public||{},s=summary(g),submitted=s.submitted>0,card=document.createElement("article");card.className="gallery-card";
    card.innerHTML=`<div class="gallery-cover"><div class="gallery-status ${p.active===false?"off":submitted?"submitted":""}">${p.active===false?"Wyłączona":submitted?`✓ ${s.submitted} zatwierdz.`:"Aktywna"}</div></div><div class="gallery-body"><h3>${esc(p.title||slug)}</h3><div class="gallery-meta"><span>${Number(p.photoCount||0)} zdjęć</span><span>${s.clients} wyborów</span><span>${p.maxFavorites?`limit ${p.maxFavorites}`:"bez limitu"}</span></div><div class="gallery-link"><input readonly value="${galleryUrl(slug)}"><button class="ghost" data-copy="${slug}">Kopiuj</button></div><div class="gallery-actions"><button class="primary" data-upload="${slug}">+ Zdjęcia</button><button class="ghost" data-manage="${slug}">Zarządzaj</button><button class="ghost" data-index="${slug}">⚡ Odbuduj indeks</button><button class="ghost" data-select="${slug}">♡ Wybory</button><button class="ghost" data-edit="${slug}">Ustawienia</button><a class="ghost" href="${galleryUrl(slug)}" target="_blank">Otwórz</a></div></div>`;
    list.appendChild(card);loadCover(card.querySelector(".gallery-cover"),slug,p.coverFile)
  });
  list.querySelectorAll("[data-copy]").forEach(b=>b.onclick=async()=>{await navigator.clipboard.writeText(galleryUrl(b.dataset.copy));toast("Link skopiowany")});
  list.querySelectorAll("[data-upload]").forEach(b=>b.onclick=()=>openUpload(b.dataset.upload));
  list.querySelectorAll("[data-manage]").forEach(b=>b.onclick=()=>openPhotos(b.dataset.manage));
  list.querySelectorAll("[data-index]").forEach(b=>b.onclick=()=>rebuildFastIndex(b.dataset.index));
  list.querySelectorAll("[data-select]").forEach(b=>b.onclick=()=>openSelections(b.dataset.select));
  list.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>openEdit(b.dataset.edit))
}
async function loadCover(el,slug,file){
  if(!file)return;
  const candidates=[`${file}.webp`,file];
  for(const candidate of candidates){
    try{el.style.backgroundImage=`url("${await getDownloadURL(sRef(storage,`galleries/${slug}/previews/${candidate}`))}")`;return}catch(_){}
  }
}
$("#gallerySearch").oninput=renderCards;$("#galleryStatusFilter").onchange=renderCards;

function resetForm(){
  $("#editingSlug").value="";$("#galleryTitleInput").value="";$("#gallerySlugInput").value="";$("#gallerySlugInput").disabled=false;$("#galleryPasswordInput").value="";$("#gallerySubtitleInput").value="";$("#expiresAtInput").value="";$("#maxFavoritesInput").value=0;$("#downloadsEnabledInput").checked=true;$("#galleryActiveInput").checked=true;$("#selectionEnabledInput").checked=true;$("#lockAfterSubmitInput").checked=false;$("#deleteGalleryBtn").hidden=true;$("#saveStatus").hidden=true
}
$("#newGalleryBtn").onclick=()=>{resetForm();$("#dialogTitle").textContent="Nowa galeria";$("#galleryDialog").showModal()};
function openEdit(slug){
  const p=galleries[slug]?.public||{};resetForm();$("#dialogTitle").textContent="Ustawienia galerii";$("#editingSlug").value=slug;$("#galleryTitleInput").value=p.title||"";$("#gallerySlugInput").value=slug;$("#gallerySlugInput").disabled=true;$("#gallerySubtitleInput").value=p.subtitle||"";$("#expiresAtInput").value=p.expiresAt||"";$("#maxFavoritesInput").value=Number(p.maxFavorites||0);$("#downloadsEnabledInput").checked=p.downloadsEnabled!==false;$("#galleryActiveInput").checked=p.active!==false;$("#selectionEnabledInput").checked=p.selectionEnabled!==false;$("#lockAfterSubmitInput").checked=!!p.lockAfterSubmit;$("#deleteGalleryBtn").hidden=false;$("#galleryDialog").showModal()
}
$("#galleryForm").onsubmit=async e=>{
  e.preventDefault();const btn=$("#saveGalleryBtn");btn.disabled=true;btn.textContent="Zapisywanie…";
  try{
    const edit=$("#editingSlug").value,slug=edit||slugify($("#gallerySlugInput").value);if(!slug)throw new Error("Podaj poprawny slug.");
    const old=galleries[slug]?.public||{},pass=$("#galleryPasswordInput").value;let passwordHash=old.passwordHash||"";if(pass)passwordHash=await hash(pass);if(!passwordHash)throw new Error("Ustaw hasło klienta.");
    const data={...old,title:$("#galleryTitleInput").value.trim()||slug,subtitle:$("#gallerySubtitleInput").value.trim(),passwordHash,expiresAt:$("#expiresAtInput").value||"",maxFavorites:Number($("#maxFavoritesInput").value||0),downloadsEnabled:$("#downloadsEnabledInput").checked,active:$("#galleryActiveInput").checked,selectionEnabled:$("#selectionEnabledInput").checked,lockAfterSubmit:$("#lockAfterSubmitInput").checked,photoCount:Number(old.photoCount||0),createdAt:old.createdAt||Date.now(),updatedAt:Date.now()};
    await set(ref(db,`galleries/${slug}/public`),data);$("#galleryDialog").close();
    if(!edit){createdSlug=slug;$("#createdLink").value=galleryUrl(slug);$("#createdDialog").showModal()}else toast("Ustawienia zapisane")
  }catch(err){notice($("#saveStatus"),err.message||String(err),"error")}
  finally{btn.disabled=false;btn.textContent="Zapisz"}
};
$("#deleteGalleryBtn").onclick=async()=>{const slug=$("#editingSlug").value;if(slug&&confirm(`Usunąć galerię ${slug} z bazy?`)){await remove(ref(db,`galleries/${slug}`));$("#galleryDialog").close();toast("Galeria usunięta")}};
$("#closeGalleryDialog").onclick=$("#cancelGalleryBtn").onclick=()=>$("#galleryDialog").close();
$("#copyCreatedLink").onclick=async()=>{await navigator.clipboard.writeText($("#createdLink").value);toast("Link skopiowany")};
$("#openCreatedGalleryBtn").onclick=()=>window.open(galleryUrl(createdSlug),"_blank");
$("#addPhotosNowBtn").onclick=()=>{$("#createdDialog").close();openUpload(createdSlug)};

function openUpload(slug){uploadSlug=slug;$("#uploadTitle").textContent=`Dodaj zdjęcia — ${galleries[slug]?.public?.title||slug}`;$("#photoFilesInput").value="";$("#uploadFileCount").textContent="0 plików";$("#uploadSize").textContent="0 MB";$("#uploadProgress").style.width="0%";$("#uploadStatus").hidden=true;$("#uploadDialog").showModal()}
const dz=$("#dropZone");["dragenter","dragover"].forEach(x=>dz.addEventListener(x,e=>e.preventDefault()));dz.addEventListener("drop",e=>{e.preventDefault();const dt=new DataTransfer();[...e.dataTransfer.files].filter(f=>/image\/jpe?g/i.test(f.type)).forEach(f=>dt.items.add(f));$("#photoFilesInput").files=dt.files;fileMeta()});$("#photoFilesInput").onchange=fileMeta;
function fileMeta(){const f=[...$("#photoFilesInput").files],b=f.reduce((a,x)=>a+x.size,0);$("#uploadFileCount").textContent=`${f.length} plików`;$("#uploadSize").textContent=`${(b/1024/1024).toFixed(1)} MB`}

async function makeWebpPreview(file){
  const url=URL.createObjectURL(file);
  const img=await new Promise((r,j)=>{const i=new Image();i.onload=()=>r(i);i.onerror=j;i.src=url});

  const attempts=[
    {max:1600,q:.76},
    {max:1500,q:.70},
    {max:1400,q:.66},
    {max:1280,q:.62}
  ];

  let lastBlob=null;
  for(const a of attempts){
    let w=img.naturalWidth,h=img.naturalHeight;
    const s=Math.min(1,a.max/Math.max(w,h));
    w=Math.max(1,Math.round(w*s));h=Math.max(1,Math.round(h*s));
    const c=document.createElement("canvas");c.width=w;c.height=h;
    c.getContext("2d",{alpha:false}).drawImage(img,0,0,w,h);
    const blob=await new Promise((r,j)=>c.toBlob(b=>b?r(b):j(new Error("Błąd WebP")),"image/webp",a.q));
    lastBlob=blob;
    if(blob.size<=650*1024)break;
  }

  URL.revokeObjectURL(url);
  return lastBlob;
}

function task(r,data,cb,contentType){return new Promise((ok,bad)=>{const t=uploadBytesResumable(r,data,{contentType,cacheControl:"public,max-age=31536000,immutable"});t.on("state_changed",s=>cb(s.totalBytes?s.bytesTransferred/s.totalBytes:0),bad,ok)})}

$("#startUploadBtn").onclick=async()=>{
  const files=[...$("#photoFilesInput").files];if(!uploadSlug||!files.length)return notice($("#uploadStatus"),"Wybierz zdjęcia JPG.","error");
  const btn=$("#startUploadBtn");btn.disabled=true;btn.textContent="Wysyłanie…";
  try{
    for(let i=0;i<files.length;i++){
      const f=files[i],base=i/files.length,weight=1/files.length;
      notice($("#uploadStatus"),`${i+1}/${files.length}: ${f.name} — tworzę szybki WebP…`);

      const p=await makeWebpPreview(f);
      const previewName=`${f.name}.webp`;

      const previewRef=sRef(storage,`galleries/${uploadSlug}/previews/${previewName}`);
      await task(
        previewRef,
        p,
        x=>$("#uploadProgress").style.width=`${Math.round((base+weight*x*.15)*100)}%`,
        "image/webp"
      );

      // Save ready preview URL into Realtime Database once, during upload.
      // Client will never need listAll/getDownloadURL for previews again.
      const previewUrl=await getDownloadURL(previewRef);
      await update(ref(db,`galleries/${uploadSlug}/public/photos/${manifestKey(f.name)}`),{
        filename:f.name,
        previewUrl,
        originalPath:`galleries/${uploadSlug}/originals/${f.name}`
      });

      notice($("#uploadStatus"),`${i+1}/${files.length}: ${f.name} — wysyłam oryginał…`);
      await task(
        sRef(storage,`galleries/${uploadSlug}/originals/${f.name}`),
        f,
        x=>$("#uploadProgress").style.width=`${Math.round((base+weight*(.15+x*.85))*100)}%`,
        "image/jpeg"
      );

      if(i===0&&!galleries[uploadSlug]?.public?.coverFile)await update(ref(db,`galleries/${uploadSlug}/public`),{coverFile:f.name})
    }

    const all=await listAll(sRef(storage,`galleries/${uploadSlug}/previews`));
    await update(ref(db,`galleries/${uploadSlug}/public`),{photoCount:all.items.length,updatedAt:Date.now(),previewFormat:"webp"});
    $("#uploadProgress").style.width="100%";
    notice($("#uploadStatus"),`Gotowe — ${files.length} zdjęć wysłanych. Podglądy zapisano jako WebP.`,"ok");
  }catch(err){notice($("#uploadStatus"),`${err.code||"Błąd"}: ${err.message||err}`,"error")}
  finally{btn.disabled=false;btn.textContent="Rozpocznij wysyłanie"}
};
$("#closeUploadDialog").onclick=$("#cancelUploadBtn").onclick=()=>$("#uploadDialog").close();


async function rebuildFastIndex(slug){
  const btn=document.querySelector(`[data-index="${slug}"]`);
  if(btn){btn.disabled=true;btn.textContent="Indeksowanie…";}
  try{
    const r=await listAll(sRef(storage,`galleries/${slug}/previews`));
    const manifest={};
    let n=0;
    for(const item of r.items){
      const filename=originalNameFromPreview(item.name);
      const previewUrl=await getDownloadURL(item);
      manifest[manifestKey(filename)]={
        filename,
        previewUrl,
        originalPath:`galleries/${slug}/originals/${filename}`
      };
      n++;
      if(btn)btn.textContent=`Indeks ${n}/${r.items.length}`;
    }
    await update(ref(db,`galleries/${slug}/public`),{
      photos:manifest,
      photoCount:n,
      fastIndexAt:Date.now()
    });
    toast(`Szybki indeks gotowy: ${n} zdjęć`);
  }catch(e){
    alert(`Nie udało się zbudować indeksu: ${e.code||""} ${e.message||e}`);
  }finally{
    if(btn){btn.disabled=false;btn.textContent="⚡ Odbuduj indeks";}
  }
}

async function openPhotos(slug){
  $("#photosTitle").textContent=`Zdjęcia — ${galleries[slug]?.public?.title||slug}`;$("#photoManagerGrid").innerHTML="";$("#photoManagerLoading").hidden=false;$("#photosDialog").showModal();
  try{
    const r=await listAll(sRef(storage,`galleries/${slug}/previews`));
    for(const item of r.items.sort((a,b)=>originalNameFromPreview(a.name).localeCompare(originalNameFromPreview(b.name),undefined,{numeric:true}))){
      const originalName=originalNameFromPreview(item.name);
      const url=await getDownloadURL(item),w=document.createElement("article");w.className="pm-item";
      w.innerHTML=`<div class="pm-thumb" style="background-image:url('${url}')"></div><div class="pm-info"><div class="pm-name">${esc(originalName)}</div><div class="pm-actions"><button class="ghost cover">Okładka</button><button class="danger del">Usuń</button></div></div>`;
      w.querySelector(".cover").onclick=async()=>{await update(ref(db,`galleries/${slug}/public`),{coverFile:originalName});toast("Okładka ustawiona")};
      w.querySelector(".del").onclick=async()=>{if(!confirm(`Usunąć ${originalName}?`))return;await deleteObject(item);await deleteObject(sRef(storage,`galleries/${slug}/originals/${originalName}`)).catch(()=>{});await remove(ref(db,`galleries/${slug}/public/photos/${manifestKey(originalName)}`)).catch(()=>{});w.remove();const left=await listAll(sRef(storage,`galleries/${slug}/previews`));await update(ref(db,`galleries/${slug}/public`),{photoCount:left.items.length});toast("Zdjęcie usunięte")};
      $("#photoManagerGrid").appendChild(w)
    }
  }finally{$("#photoManagerLoading").hidden=true}
}
$("#closePhotosDialog").onclick=()=>$("#photosDialog").close();

function download(name,text,type="text/plain"){const b=new Blob([text],{type}),a=document.createElement("a");a.href=URL.createObjectURL(b);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function openSelections(slug){
  const g=galleries[slug]||{},sels=g.selections||{},wrap=$("#selectionContent");$("#selectionTitle").textContent=`${g.public?.title||slug} — wybory`;wrap.innerHTML="";
  const clients=Object.entries(sels);if(!clients.length)wrap.innerHTML='<div class="notice">Klienci nie zaznaczyli jeszcze zdjęć.</div>';
  clients.forEach(([id,s])=>{
    const items=Object.values(s?.items||{}).filter(x=>x?.filename).sort((a,b)=>a.filename.localeCompare(b.filename,undefined,{numeric:true})),m=s?.meta||{},sub=!!m.submittedAt,sec=document.createElement("section");sec.className="selection-client";
    sec.innerHTML=`<div class="selection-head"><div><h3>${esc(m.clientName||`Klient ${id.slice(0,8)}…`)}</h3><div class="gallery-meta"><span>${items.length} zdjęć</span><span>${sub?`zatwierdzono ${fmt(m.submittedAt)}`:"wybór roboczy"}</span></div>${m.note?`<p class="muted">${esc(m.note)}</p>`:""}</div><span class="selection-badge ${sub?"submitted":""}">${sub?"✓ Zatwierdzony":"Roboczy"}</span></div><div class="selection-list">${items.map(x=>`<div class="selection-item">${esc(x.filename)}</div>`).join("")}</div><div class="selection-tools"><button class="ghost txt">TXT</button><button class="ghost csv">CSV</button></div>`;
    sec.querySelector(".txt").onclick=()=>download(`${slug}-wybor.txt`,items.map(x=>x.filename).join("\r\n"));
    sec.querySelector(".csv").onclick=()=>download(`${slug}-wybor.csv`,"filename\r\n"+items.map(x=>`"${x.filename.replaceAll('"','""')}"`).join("\r\n"),"text/csv");wrap.appendChild(sec)
  });$("#selectionDialog").showModal()
}
$("#closeSelectionDialog").onclick=()=>$("#selectionDialog").close();