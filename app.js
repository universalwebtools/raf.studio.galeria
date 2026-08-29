import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getStorage, ref, listAll, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js";
import { firebaseConfig, galleryConfig as cfg } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const storage = getStorage(app);
const $ = s => document.querySelector(s);

async function loadGallery(){
  $("#loading").hidden=false; $("#storageError").hidden=true;
  try{
    const result = await listAll(ref(storage,cfg.previewFolder));
    const items = [...result.items].sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));
    const photos = await Promise.all(items.map(async i=>({name:i.name,url:await getDownloadURL(i)})));
    $("#loading").hidden=true;
    const grid=$("#grid"); grid.innerHTML="";
    if(!photos.length){grid.innerHTML="<p>Folder previews jest pusty.</p>";return;}
    for(const p of photos){
      const d=document.createElement("div"); d.className="photo";
      d.innerHTML=`<a href="${p.url}" target="_blank"><img loading="lazy" src="${p.url}" alt="${p.name}"></a>`;
      grid.appendChild(d);
    }
  }catch(err){
    $("#loading").hidden=true; $("#storageError").hidden=false;
    $("#storageError").textContent=`Błąd Firebase: ${err.code||""} ${err.message||""}`;
  }
}
$("#passwordForm").addEventListener("submit",e=>{
  e.preventDefault();
  if($("#passwordInput").value!==cfg.password){$("#passwordError").hidden=false;return;}
  sessionStorage.setItem("raf-access","1");
  $("#lockScreen").hidden=true; $("#galleryView").hidden=false; loadGallery();
});
$("#logoutBtn").onclick=()=>{sessionStorage.removeItem("raf-access");location.reload();};
if(sessionStorage.getItem("raf-access")==="1"){ $("#lockScreen").hidden=true; $("#galleryView").hidden=false; loadGallery(); }