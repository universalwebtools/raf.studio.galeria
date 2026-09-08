import { getApps, getApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getDatabase, ref, onValue, get, update, remove } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";
import { ADMIN_UID } from "./firebase-config.js?v=18.0";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const STATUS_OPTIONS = [
  ["waiting","Oczekuje na wybór"],
  ["selected","Wybór zatwierdzony"],
  ["editing","W obróbce"],
  ["ready","Gotowe"],
  ["delivered","Dostarczone"]
];
const STATUS_LABELS = Object.fromEntries(STATUS_OPTIONS);

const TEMPLATES = {
  wedding: {
    name:"Ślub / narzeczeńska", icon:"♥", subtitle:"Wybierzcie swoje ulubione kadry ❤️", intro:"Wasza prywatna galeria jest gotowa. Miłego oglądania!", outro:"Dziękuję za zaufanie. Niech te kadry zostaną z Wami na lata ❤️",
    uiConfig:{desktopColumns:4,tabletColumns:3,mobileColumns:2,gridGap:8,mobileGridGap:7,cardRadius:10,mobileCardRadius:9,heartColor:"#ff3b4d",heroLayout:"trio",heroFit:"cover",heroOverlay:44,heroTileGap:4,heroTileRadius:5},
    presentationConfig:{interval:5}
  },
  family: {
    name:"Rodzinna", icon:"⌂", subtitle:"Wasza rodzinna historia w kadrach", intro:"Cieszę się, że mogę oddać Wam tę rodzinną pamiątkę ❤️", outro:"Dziękuję za wspólnie spędzony czas i mnóstwo naturalnych emocji.",
    uiConfig:{desktopColumns:4,tabletColumns:3,mobileColumns:2,gridGap:10,mobileGridGap:8,cardRadius:16,mobileCardRadius:13,heartColor:"#ff5d6c",heroLayout:"duo",heroFit:"cover",heroOverlay:38,heroTileGap:6,heroTileRadius:14},
    presentationConfig:{interval:6}
  },
  christening: {
    name:"Chrzest / komunia", icon:"✦", subtitle:"Najpiękniejsze momenty tego wyjątkowego dnia", intro:"Galeria jest gotowa — zapraszam do spokojnego obejrzenia i wyboru zdjęć.", outro:"Dziękuję za możliwość uwiecznienia tego ważnego dnia.",
    uiConfig:{desktopColumns:4,tabletColumns:3,mobileColumns:2,gridGap:10,mobileGridGap:8,cardRadius:12,mobileCardRadius:10,heartColor:"#e9d8a6",heroLayout:"trio",heroFit:"cover",heroOverlay:34,heroTileGap:5,heroTileRadius:10},
    presentationConfig:{interval:6}
  },
  corporate: {
    name:"Firmowa / biznesowa", icon:"▦", subtitle:"Materiały z sesji firmowej", intro:"Prywatna galeria materiałów jest gotowa do przeglądania.", outro:"Dziękuję za współpracę z RAF.studio.",
    uiConfig:{desktopColumns:5,tabletColumns:4,mobileColumns:2,gridGap:6,mobileGridGap:6,cardRadius:4,mobileCardRadius:4,heartColor:"#4ea5ff",heroLayout:"single",heroFit:"cover",heroOverlay:55,heroTileGap:0,heroTileRadius:0},
    presentationConfig:{interval:4}
  },
  event: {
    name:"Event", icon:"▶", subtitle:"Galeria z wydarzenia", intro:"Zdjęcia z wydarzenia są już gotowe — zapraszam do galerii.", outro:"Dziękuję za współpracę i do zobaczenia na kolejnym wydarzeniu!",
    uiConfig:{desktopColumns:5,tabletColumns:4,mobileColumns:2,gridGap:6,mobileGridGap:5,cardRadius:8,mobileCardRadius:7,heartColor:"#ff3b4d",heroLayout:"mosaic4",heroFit:"cover",heroOverlay:48,heroTileGap:3,heroTileRadius:4},
    presentationConfig:{interval:4}
  }
};

let app, auth, db;
let galleries = {};
let analytics = {};
let approvals = {};
let initialized = false;
let pendingTemplateKey = "";

function esc(value) { return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c])); }
function fmtTime(value) { const n=Number(value||0); if(!n) return "—"; try{return new Intl.DateTimeFormat("pl-PL",{dateStyle:"short",timeStyle:"short"}).format(new Date(n));}catch{return "—";} }
function sum(list,key){return list.reduce((acc,item)=>acc+Number(item?.[key]||0),0);}
function wait(ms){return new Promise(r=>setTimeout(r,ms));}

async function waitForApp(){for(let i=0;i<160;i++){if(getApps().length)return getApp();await wait(25);}return null;}

function toast(message){
  const old=$("#rafV18AdminToast"); if(old) old.remove();
  const el=document.createElement("div"); el.id="rafV18AdminToast"; el.textContent=message;
  el.style.cssText="position:fixed;z-index:120000;left:50%;bottom:24px;transform:translateX(-50%);padding:11px 14px;border-radius:12px;background:#f4f4f1;color:#111;font:800 12px system-ui;box-shadow:0 16px 55px #0009;max-width:min(92vw,560px);text-align:center";
  document.body.appendChild(el); setTimeout(()=>el.remove(),3200);
}

function injectStyles(){
  if($("#rafV18AdminStyles")) return;
  const s=document.createElement("style");s.id="rafV18AdminStyles";s.textContent=`
    #rafV18TemplatesDialog,#rafV18ActivityDialog{width:min(1040px,calc(100% - 18px));max-height:90vh;padding:0;border:1px solid #34343a;border-radius:20px;background:#111113;color:#f4f4f2}#rafV18TemplatesDialog::backdrop,#rafV18ActivityDialog::backdrop{background:#000c;backdrop-filter:blur(7px)}
    .raf-v18-head{display:flex;align-items:flex-start;gap:14px;padding:20px;border-bottom:1px solid #29292f}.raf-v18-head h2{margin:3px 0 5px;font-size:28px}.raf-v18-head p{margin:0;color:#8d8d95;font-size:12px}.raf-v18-head .spacer{flex:1}.raf-v18-close{width:40px;height:40px;border:1px solid #34343a;border-radius:11px;background:#17171a;color:#fff;font-size:20px}
    .raf-v18-body{padding:16px 20px 20px}.raf-v18-template-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}.raf-v18-template{padding:16px;border:1px solid #2d2d33;border-radius:15px;background:#151518;cursor:pointer;text-align:left;color:#fff}.raf-v18-template:hover{border-color:#666}.raf-v18-template b{display:block;font-size:14px;margin:8px 0 5px}.raf-v18-template small{color:#8d8d95;line-height:1.35}.raf-v18-template-icon{font-size:22px}
    .raf-v18-picker{margin:12px 0;padding:12px;border:1px solid #303036;border-radius:14px;background:#141417}.raf-v18-picker-row{display:flex;gap:8px;align-items:end;flex-wrap:wrap}.raf-v18-picker label{min-width:220px;flex:1}.raf-v18-picker select{width:100%}
    .raf-v18-card-tools{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:7px}.raf-v18-status-select{min-width:150px;padding:7px 9px;border:1px solid #34343a;border-radius:10px;background:#151518;color:#fff;font-size:10px}.raf-v18-comment-badge{padding:6px 8px;border:1px solid #59492a;border-radius:9px;background:#1c180f;color:#ffd88c;font-size:10px;font-weight:800}
    .raf-v18-activity-list{display:grid;gap:10px}.raf-v18-activity-row{display:grid;grid-template-columns:minmax(180px,1.1fr) repeat(6,minmax(80px,.65fr));gap:8px;align-items:stretch;padding:12px;border:1px solid #2d2d32;border-radius:14px;background:#151518}.raf-v18-activity-main{padding:7px}.raf-v18-activity-main strong{display:block;font-size:14px}.raf-v18-activity-main small{display:block;color:#888;margin-top:4px}.raf-v18-metric{padding:8px;border:1px solid #29292e;border-radius:10px;background:#111113}.raf-v18-metric span{display:block;color:#85858d;font-size:9px;text-transform:uppercase;letter-spacing:.05em}.raf-v18-metric b{display:block;font-size:15px;margin-top:4px}.raf-v18-activity-comment{grid-column:1/-1;padding:9px 11px;border-left:3px solid #7a6532;background:#18160f;border-radius:8px;color:#dcd2b7;font-size:11px}.raf-v18-activity-actions{grid-column:1/-1;display:flex;gap:8px;justify-content:flex-end}
    @media(max-width:900px){.raf-v18-template-grid{grid-template-columns:repeat(2,1fr)}.raf-v18-activity-row{grid-template-columns:repeat(2,1fr)}.raf-v18-activity-main{grid-column:1/-1}}@media(max-width:560px){.raf-v18-template-grid{grid-template-columns:1fr}.raf-v18-activity-row{grid-template-columns:1fr}}
  `;document.head.appendChild(s);
}

function injectHeaderButtons(){
  const actions=$(".admin-head-actions"); if(!actions) return;
  if(!$("#rafV18TemplatesBtn")){const b=document.createElement("button");b.id="rafV18TemplatesBtn";b.type="button";b.className="ghost";b.textContent="🧩 Szablony";actions.insertBefore(b,$("#newGalleryBtn")||null);b.onclick=()=>$("#rafV18TemplatesDialog")?.showModal();}
  if(!$("#rafV18ActivityBtn")){const b=document.createElement("button");b.id="rafV18ActivityBtn";b.type="button";b.className="ghost";b.textContent="📊 Aktywność";actions.insertBefore(b,$("#newGalleryBtn")||null);b.onclick=()=>{renderActivity();$("#rafV18ActivityDialog")?.showModal();};}
}

function injectDialogs(){
  if(!$("#rafV18TemplatesDialog")) document.body.insertAdjacentHTML("beforeend",`<dialog id="rafV18TemplatesDialog"><div class="raf-v18-head"><div><small class="eyebrow">PRESETY RAF.STUDIO</small><h2>Szablony galerii</h2><p>Gotowe ustawienia dla najczęstszych rodzajów sesji. Możesz później wszystko zmienić ręcznie.</p></div><span class="spacer"></span><button class="raf-v18-close" data-v18-close="rafV18TemplatesDialog">×</button></div><div class="raf-v18-body"><div class="raf-v18-template-grid">${Object.entries(TEMPLATES).map(([key,t])=>`<button type="button" class="raf-v18-template" data-v18-template="${key}"><span class="raf-v18-template-icon">${t.icon}</span><b>${esc(t.name)}</b><small>${esc(t.subtitle)}</small></button>`).join("")}</div><p class="muted" style="margin:14px 0 0;font-size:10px">Kliknięcie szablonu otworzy „Nową galerię” i uzupełni pola. Jeśli formularz galerii jest już otwarty, preset zostanie zastosowany do niego.</p></div></dialog>`);
  if(!$("#rafV18ActivityDialog")) document.body.insertAdjacentHTML("beforeend",`<dialog id="rafV18ActivityDialog"><div class="raf-v18-head"><div><small class="eyebrow">KLIENCI</small><h2>Aktywność i statystyki</h2><p>Otwarcia galerii, obejrzane zdjęcia, pobrania, status realizacji i ostatni komentarz do wyboru.</p></div><span class="spacer"></span><button class="raf-v18-close" data-v18-close="rafV18ActivityDialog">×</button></div><div class="raf-v18-body"><div id="rafV18ActivityList" class="raf-v18-activity-list"></div></div></dialog>`);
  $$('[data-v18-close]').forEach(b=>{if(b.dataset.bound)return;b.dataset.bound="1";b.onclick=()=>$("#"+b.dataset.v18Close)?.close();});
  $$('[data-v18-template]').forEach(b=>{if(b.dataset.bound)return;b.dataset.bound="1";b.onclick=()=>chooseTemplate(b.dataset.v18Template);});
}

function injectTemplatePickerIntoGalleryForm(){
  const form=$("#galleryForm"); if(!form||$("#rafV18TemplatePicker")) return;
  const title=form.querySelector(".dialog-head");
  const box=document.createElement("div");box.id="rafV18TemplatePicker";box.className="raf-v18-picker";box.innerHTML=`<div class="raf-v18-picker-row"><label>Szablon galerii<select id="rafV18TemplateSelect"><option value="">— wybierz —</option>${Object.entries(TEMPLATES).map(([k,t])=>`<option value="${k}">${esc(t.name)}</option>`).join("")}</select></label><button id="rafV18ApplyTemplate" type="button" class="ghost">Zastosuj szablon</button></div>`;
  title?.insertAdjacentElement("afterend",box);
  $("#rafV18ApplyTemplate").onclick=()=>{const key=$("#rafV18TemplateSelect").value;if(key)applyTemplateToOpenForm(key,true);};
  form.addEventListener("submit",()=>{if(pendingTemplateKey)scheduleNewGalleryTemplateSave(pendingTemplateKey);},true);
}

function setVal(id,value){const el=$("#"+id);if(el&&value!==undefined)el.value=value;}
function applyTemplateToOpenForm(key,persistIfEditing=false){
  const t=TEMPLATES[key]; if(!t)return;
  pendingTemplateKey=key;
  setVal("gallerySubtitleInput",t.subtitle);setVal("introMessageInput",t.intro);setVal("outroMessageInput",t.outro);
  const editing=$("#editingSlug")?.value?.trim();
  if(persistIfEditing&&editing){update(ref(db,`galleries/${editing}/public`),{uiConfig:t.uiConfig,presentationConfig:t.presentationConfig,templateKey:key,updatedAt:Date.now()}).then(()=>toast(`Zastosowano szablon: ${t.name}`)).catch(e=>toast(`Błąd szablonu: ${e.message||e}`));}
  else toast(`Szablon „${t.name}” wczytany do formularza`);
}

function chooseTemplate(key){
  $("#rafV18TemplatesDialog")?.close();
  const dlg=$("#galleryDialog");
  if(!dlg?.open) $("#newGalleryBtn")?.click();
  setTimeout(()=>{if($("#rafV18TemplateSelect"))$("#rafV18TemplateSelect").value=key;applyTemplateToOpenForm(key,false);},120);
}

function scheduleNewGalleryTemplateSave(key){
  const t=TEMPLATES[key];if(!t)return;
  const slug=String($("#gallerySlugInput")?.value||"").trim();if(!slug)return;
  pendingTemplateKey="";
  (async()=>{for(let i=0;i<12;i++){await wait(450);try{const snap=await get(ref(db,`galleries/${slug}/public`));if(!snap.exists())continue;await update(ref(db,`galleries/${slug}/public`),{uiConfig:t.uiConfig,presentationConfig:t.presentationConfig,templateKey:key,updatedAt:Date.now()});toast(`Nowa galeria otrzymała szablon: ${t.name}`);break;}catch(_){}}})();
}

function latestNormalApproval(slug){
  const items=Object.values(approvals?.[slug]||{}).filter(x=>x&&x.mode!=="rejected"&&Number(x.submittedAt||0)>0).sort((a,b)=>Number(b.submittedAt)-Number(a.submittedAt));return items[0]||null;
}

function decorateCards(){
  const list=$("#galleryList");if(!list)return;
  $$(".gallery-card",list).forEach(card=>{
    const slug=$("[data-upload]",card)?.dataset.upload||$("[data-copy]",card)?.dataset.copy;if(!slug)return;
    let row=$(".raf-v18-card-tools",card);if(!row){row=document.createElement("div");row.className="raf-v18-card-tools";($(".gallery-body",card)||card).appendChild(row);}
    const pub=galleries?.[slug]?.public||{};const status=typeof pub.workflowStatus==="string"?pub.workflowStatus:(pub.workflowStatus?.key||"waiting");const approval=latestNormalApproval(slug);const comment=String(approval?.comment||"").trim();
    row.innerHTML=`<select class="raf-v18-status-select" data-v18-status="${esc(slug)}" title="Status widoczny dla klienta">${STATUS_OPTIONS.map(([k,label])=>`<option value="${k}" ${k===status?"selected":""}>${esc(label)}</option>`).join("")}</select>${comment?`<span class="raf-v18-comment-badge" title="${esc(comment)}">💬 Komentarz klienta</span>`:""}`;
    $("[data-v18-status]",row).onchange=e=>saveStatus(slug,e.target.value);
  });
}

async function saveStatus(slug,key){
  const label=STATUS_LABELS[key]||STATUS_LABELS.waiting;try{await update(ref(db,`galleries/${slug}/public`),{workflowStatus:{key,label,updatedAt:Date.now()},updatedAt:Date.now()});toast(`Status: ${label}`);}catch(e){toast(`Nie udało się zapisać statusu: ${e.message||e}`);}
}

function aggregateStats(slug){
  const clients=Object.values(analytics?.[slug]||{}).filter(Boolean);
  const viewed=new Set();clients.forEach(c=>Object.values(c.viewed||{}).forEach(v=>{if(v?.filename)viewed.add(v.filename);}));
  const last=Math.max(0,...clients.map(c=>Number(c.lastOpenedAt||c.lastActivityAt||0)));
  return {clients:clients.length,visits:sum(clients,"visits"),viewed:viewed.size,downloads:sum(clients,"downloadsTotal"),full:sum(clients,"fullGalleryDownloads"),presentation:sum(clients,"presentationStarts"),last};
}

function activeGalleryEntries(){return Object.entries(galleries||{}).filter(([slug,g])=>!slug.startsWith("__system__")&&g?.public&&!g.public.trashedAt).sort((a,b)=>String(a[1].public.title||a[0]).localeCompare(String(b[1].public.title||b[0]),"pl",{numeric:true}));}

function renderActivity(){
  const list=$("#rafV18ActivityList");if(!list)return;const rows=activeGalleryEntries();if(!rows.length){list.innerHTML='<div class="notice">Brak galerii.</div>';return;}
  list.innerHTML=rows.map(([slug,g])=>{const pub=g.public||{};const st=aggregateStats(slug);const approval=latestNormalApproval(slug);const comment=String(approval?.comment||"").trim();const status=typeof pub.workflowStatus==="string"?pub.workflowStatus:(pub.workflowStatus?.key||"waiting");return `<div class="raf-v18-activity-row"><div class="raf-v18-activity-main"><strong>${esc(pub.title||slug)}</strong><small>Ostatnio: ${esc(fmtTime(st.last))} • ${st.clients} urządzeń</small></div><div class="raf-v18-metric"><span>Wejścia</span><b>${st.visits}</b></div><div class="raf-v18-metric"><span>Obejrzane</span><b>${st.viewed}</b></div><div class="raf-v18-metric"><span>Pobrania</span><b>${st.downloads}</b></div><div class="raf-v18-metric"><span>Cała galeria</span><b>${st.full}</b></div><div class="raf-v18-metric"><span>Prezentacje</span><b>${st.presentation}</b></div><div class="raf-v18-metric"><span>Wybrano</span><b>${Number(approval?.selectedCount||0)}</b></div>${comment?`<div class="raf-v18-activity-comment"><b>💬 Komentarz do wyboru:</b> ${esc(comment)}</div>`:""}<div class="raf-v18-activity-actions"><select class="raf-v18-status-select" data-v18-activity-status="${esc(slug)}">${STATUS_OPTIONS.map(([k,label])=>`<option value="${k}" ${k===status?"selected":""}>${esc(label)}</option>`).join("")}</select><button type="button" class="ghost" data-v18-clear-stats="${esc(slug)}">Wyczyść statystyki</button></div></div>`;}).join("");
  $$('[data-v18-activity-status]',list).forEach(el=>el.onchange=()=>saveStatus(el.dataset.v18ActivityStatus,el.value));
  $$('[data-v18-clear-stats]',list).forEach(b=>b.onclick=async()=>{const slug=b.dataset.v18ClearStats;if(!confirm(`Wyczyścić statystyki galerii „${galleries?.[slug]?.public?.title||slug}”?`))return;try{await remove(ref(db,`clientAnalytics/${slug}`));toast("Statystyki wyczyszczone");}catch(e){toast(`Błąd: ${e.message||e}`);}});
}

function startSubscriptions(){
  onValue(ref(db,"galleries"),snap=>{galleries=snap.val()||{};decorateCards();renderActivity();});
  onValue(ref(db,"approvals"),snap=>{approvals=snap.val()||{};decorateCards();renderActivity();});
  onValue(ref(db,"clientAnalytics"),snap=>{analytics=snap.val()||{};renderActivity();},error=>{console.info("RAF v18 analytics: opublikuj nowe Database Rules, aby admin mógł czytać statystyki.",error?.code||error);analytics={};renderActivity();});
  const list=$("#galleryList");if(list)new MutationObserver(()=>decorateCards()).observe(list,{childList:true,subtree:true});
}

async function init(){
  if(initialized)return;initialized=true;injectStyles();injectDialogs();injectHeaderButtons();injectTemplatePickerIntoGalleryForm();
  app=await waitForApp();if(!app)return;auth=getAuth(app);db=getDatabase(app);
  onAuthStateChanged(auth,user=>{if(!user||user.uid!==ADMIN_UID)return;startSubscriptions();setTimeout(()=>{injectHeaderButtons();injectTemplatePickerIntoGalleryForm();decorateCards();},250);});
}

init().catch(error=>console.warn("RAF admin premium v18 failed",error));
