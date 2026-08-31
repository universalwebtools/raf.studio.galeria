import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getDatabase, ref, get, update } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";
import { firebaseConfig, ADMIN_UID } from "./firebase-config.js?v=16.6";

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
const CONFIG_PATH = "galleries/__system__/public/clientZoneConfig";
const $ = (selector, root = document) => root.querySelector(selector);

const DEFAULTS = {
  coverBlur: 50,
  headerTitle: "Strefa klienta",
  headerLead: "Wybierz swoją galerię, a następnie wpisz hasło otrzymane od fotografa.",
  showHeaderLead: true,
  showGalleryCount: true,
  showSearch: true,
  showPrivateBadge: true,
  privateBadgeText: "PRYWATNA GALERIA • DOSTĘP CHRONIONY HASŁEM",
  showTrustBar: true,
  trustText: "🔒 Prywatna strefa klienta • Dostęp do galerii chroniony hasłem",
  showFooter: true,
  showFooterLogo: true,
  showCopyright: true,
  copyrightText: "© 2026 RAF.studio. Wszelkie prawa zastrzeżone.",
  showPrivacy: true,
  privacyLabel: "Polityka prywatności",
  privacyTitle: "Polityka prywatności",
  privacyText: "Strefa klienta RAF.studio służy do udostępniania prywatnych galerii fotograficznych. Dostęp do wybranych galerii może być chroniony hasłem.\n\nDo działania serwisu wykorzystywane są usługi Firebase, w tym uwierzytelnianie, baza danych oraz przechowywanie plików. W zakresie niezbędnym do działania galerii mogą być przetwarzane techniczne identyfikatory sesji, informacje o wyborach zdjęć oraz dane potrzebne do udostępnienia i pobierania materiałów.\n\nTa strefa klienta nie wykorzystuje plików cookies do reklam ani profilowania marketingowego. Niezbędne dane techniczne mogą być zapisywane lokalnie w przeglądarce w celu utrzymania sesji i działania funkcji galerii.\n\nW sprawach dotyczących prywatności skontaktuj się z RAF.studio poprzez dane dostępne w sekcji Kontakt.",
  showContact: true,
  contactLabel: "Kontakt",
  contactTitle: "Kontakt",
  contactEmail: "",
  contactWebsite: "",
  contactInstagram: "",
  showHow: true,
  howLabel: "Jak działa strefa klienta?",
  howTitle: "Jak działa strefa klienta?",
  howStep1: "Wybierz swoją galerię z listy.",
  howStep2: "Wpisz hasło otrzymane od fotografa.",
  howStep3: "Oglądaj, wybieraj i pobieraj zdjęcia zgodnie z ustawieniami galerii."
};

const toggleMap = {
  homeShowHeaderLead:"showHeaderLead", homeShowGalleryCount:"showGalleryCount", homeShowSearch:"showSearch",
  homeShowPrivateBadge:"showPrivateBadge", homeShowTrustBar:"showTrustBar", homeShowFooter:"showFooter",
  homeShowFooterLogo:"showFooterLogo", homeShowCopyright:"showCopyright", homeShowPrivacy:"showPrivacy",
  homeShowContact:"showContact", homeShowHow:"showHow"
};

function injectStyles(){
  if(document.getElementById("homeSettingsAdminStyles")) return;
  const style=document.createElement("style");
  style.id="homeSettingsAdminStyles";
  style.textContent=`
    #homeSettingsDialog{width:min(1220px,calc(100% - 20px));max-height:92vh;padding:0;border:1px solid #33333a;border-radius:22px;background:#111113;color:#f5f5f2}#homeSettingsDialog::backdrop{background:#000c;backdrop-filter:blur(7px)}
    .home-settings-head{display:flex;justify-content:space-between;gap:18px;padding:22px;border-bottom:1px solid #29292f}.home-settings-head h2{margin:4px 0 5px;font-size:30px}.home-settings-head p{margin:0;color:#8e8e95}.home-settings-close{width:40px;height:40px;border:1px solid #34343a;border-radius:12px;background:#17171a;color:#fff;font-size:22px;cursor:pointer}
    .home-settings-grid{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(320px,.65fr);gap:16px;padding:16px 20px 20px}.home-settings-controls{display:grid;gap:12px;min-width:0}.home-settings-section{border:1px solid #2c2c31;border-radius:16px;background:#0f0f11;padding:15px}.home-settings-section h3{margin:0 0 11px;font-size:16px}.home-settings-section p.hint{margin:-3px 0 11px;color:#76767d;font-size:11px;line-height:1.45}.home-settings-form2,.home-settings-form3{display:grid;gap:10px}.home-settings-form2{grid-template-columns:repeat(2,minmax(0,1fr))}.home-settings-form3{grid-template-columns:repeat(3,minmax(0,1fr))}.home-settings-section label:not(.home-toggle){display:grid;gap:6px;color:#b9b9bf;font-size:11px}.home-settings-section input[type=text],.home-settings-section input[type=email],.home-settings-section input[type=url],.home-settings-section input[type=number],.home-settings-section textarea{width:100%;border:1px solid #34343a;border-radius:11px;background:#151518;color:#fff;padding:10px 11px;outline:0}.home-settings-section textarea{min-height:120px;resize:vertical;line-height:1.5}.home-settings-section input:focus,.home-settings-section textarea:focus{border-color:#686871}.home-toggle-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.home-toggle{display:flex;align-items:center;gap:9px;padding:10px;border:1px solid #303036;border-radius:11px;background:#151518;color:#ddd;font-size:11px}.home-toggle input{width:16px;height:16px;accent-color:#f3f3f0}.home-blur-row{display:grid;grid-template-columns:90px 1fr;gap:10px;align-items:center}.home-blur-row input[type=range]{width:100%}
    .home-settings-preview{position:sticky;top:0;align-self:start;border:1px solid #2e2e34;border-radius:18px;background:#0a0a0c;padding:14px}.home-settings-preview>small{font-size:9px;letter-spacing:.16em;color:#777}.home-preview-card{margin-top:10px;border:1px solid #28282e;border-radius:15px;overflow:hidden;background:#101012}.home-preview-head{padding:18px}.home-preview-head strong{display:block;font-size:24px;margin-bottom:6px}.home-preview-head span{font-size:10px;color:#888}.home-preview-trust{margin:0 10px 10px;padding:8px;border:1px solid #29292f;border-radius:9px;color:#aaa;font-size:8px;text-align:center}.home-preview-gallery{height:112px;margin:0 10px 10px;border:1px solid #2e2e33;border-radius:12px;background:linear-gradient(130deg,#353538,#111);display:flex;align-items:flex-end;padding:10px}.home-preview-gallery div{font-weight:800}.home-preview-gallery small{display:block;color:#bbb;font-size:7px;margin-bottom:4px}.home-preview-footer{border-top:1px solid #242428;padding:11px;display:flex;justify-content:space-between;gap:8px;color:#777;font-size:7px}.home-preview-links{display:flex;gap:5px;flex-wrap:wrap}.home-preview-links span{padding:3px 4px;border-radius:5px;background:#17171a;color:#aaa}.home-settings-actions{display:flex;align-items:center;gap:8px;padding-top:3px}.home-settings-actions .spacer{flex:1}.home-settings-status{padding:10px 12px;border:1px solid #303036;border-radius:11px;color:#aaa;font-size:11px}.home-settings-status.ok{border-color:#315c3c;color:#aee9ba}.home-settings-status.error{border-color:#67383e;color:#ffb6bd}
    @media(max-width:900px){.home-settings-grid{grid-template-columns:1fr}.home-settings-preview{position:static}}@media(max-width:650px){.home-settings-form2,.home-settings-form3,.home-toggle-grid{grid-template-columns:1fr}.home-settings-grid{padding:12px}.home-settings-head{padding:17px}}
  `;
  document.head.appendChild(style);
}

function injectUi(){
  if(document.getElementById("homeSettingsBtn")) return;
  const actions=$(".admin-head-actions"); if(!actions) return;
  const button=document.createElement("button"); button.id="homeSettingsBtn";button.type="button";button.className="ghost";button.textContent="🏠 Strefa klienta";
  const before=$("#healthPanelBtn"); if(before) actions.insertBefore(button,before); else actions.prepend(button);
  document.body.insertAdjacentHTML("beforeend",`
    <dialog id="homeSettingsDialog"><div class="home-settings-head"><div><small class="eyebrow">STRONA GŁÓWNA GALERII</small><h2>Ustawienia Strefy klienta</h2><p>Edytuj stronę home, elementy prywatności, kontakt i stopkę bez grzebania w kodzie.</p></div><button id="homeSettingsClose" class="home-settings-close" type="button">×</button></div>
    <div class="home-settings-grid"><div class="home-settings-controls">
      <section class="home-settings-section"><h3>Nagłówek i lista galerii</h3><div class="home-settings-form2"><label>Tytuł<input id="homeHeaderTitle" type="text"></label><label>Opis<input id="homeHeaderLead" type="text"></label></div><div class="home-settings-form2"><label>Tekst nad nazwą galerii<input id="homePrivateBadgeText" type="text"></label><label>Anonimizacja okładki<div class="home-blur-row"><input id="homeCoverBlurNumber" type="number" min="0" max="100"><input id="homeCoverBlurRange" type="range" min="0" max="100"></div></label></div><div class="home-toggle-grid"><label class="home-toggle"><input id="homeShowHeaderLead" type="checkbox">Opis pod tytułem</label><label class="home-toggle"><input id="homeShowGalleryCount" type="checkbox">Licznik galerii</label><label class="home-toggle"><input id="homeShowSearch" type="checkbox">Wyszukiwarka</label><label class="home-toggle"><input id="homeShowPrivateBadge" type="checkbox">Napis „prywatna galeria”</label></div></section>
      <section class="home-settings-section"><h3>Pasek zaufania</h3><p class="hint">Mały komunikat pod nagłówkiem, który podkreśla prywatny charakter galerii.</p><label>Treść<input id="homeTrustText" type="text"></label><div class="home-toggle-grid"><label class="home-toggle"><input id="homeShowTrustBar" type="checkbox">Pokazuj pasek zaufania</label></div></section>
      <section class="home-settings-section"><h3>Stopka</h3><div class="home-settings-form2"><label>Copyright<input id="homeCopyrightText" type="text"></label></div><div class="home-toggle-grid"><label class="home-toggle"><input id="homeShowFooter" type="checkbox">Cała stopka</label><label class="home-toggle"><input id="homeShowFooterLogo" type="checkbox">Logo w stopce</label><label class="home-toggle"><input id="homeShowCopyright" type="checkbox">Copyright</label></div></section>
      <section class="home-settings-section"><h3>Polityka prywatności</h3><div class="home-settings-form2"><label>Nazwa przycisku<input id="homePrivacyLabel" type="text"></label><label>Tytuł okna<input id="homePrivacyTitle" type="text"></label></div><label>Treść polityki<textarea id="homePrivacyText"></textarea></label><div class="home-toggle-grid"><label class="home-toggle"><input id="homeShowPrivacy" type="checkbox">Pokazuj przycisk Polityka prywatności</label></div></section>
      <section class="home-settings-section"><h3>Kontakt</h3><div class="home-settings-form2"><label>Nazwa przycisku<input id="homeContactLabel" type="text"></label><label>Tytuł okna<input id="homeContactTitle" type="text"></label></div><div class="home-settings-form3"><label>E-mail<input id="homeContactEmail" type="email" placeholder="opcjonalnie"></label><label>Strona WWW<input id="homeContactWebsite" type="url" placeholder="https://..."></label><label>Instagram<input id="homeContactInstagram" type="url" placeholder="https://instagram.com/..."></label></div><div class="home-toggle-grid"><label class="home-toggle"><input id="homeShowContact" type="checkbox">Pokazuj przycisk Kontakt</label></div></section>
      <section class="home-settings-section"><h3>Jak działa Strefa klienta?</h3><div class="home-settings-form2"><label>Nazwa przycisku<input id="homeHowLabel" type="text"></label><label>Tytuł okna<input id="homeHowTitle" type="text"></label></div><div class="home-settings-form3"><label>Krok 1<input id="homeHowStep1" type="text"></label><label>Krok 2<input id="homeHowStep2" type="text"></label><label>Krok 3<input id="homeHowStep3" type="text"></label></div><div class="home-toggle-grid"><label class="home-toggle"><input id="homeShowHow" type="checkbox">Pokazuj „Jak działa?”</label></div></section>
      <div id="homeSettingsStatus" class="home-settings-status" hidden></div><div class="home-settings-actions"><button id="homeSettingsDefaults" type="button" class="ghost">Przywróć domyślne</button><button id="homeSettingsOpen" type="button" class="ghost">Otwórz stronę home</button><span class="spacer"></span><button id="homeSettingsCancel" type="button" class="ghost">Anuluj</button><button id="homeSettingsSave" type="button" class="primary">Zapisz ustawienia</button></div>
    </div><aside class="home-settings-preview"><small>PODGLĄD</small><div class="home-preview-card"><div class="home-preview-head"><strong id="homePreviewTitle">Strefa klienta</strong><span id="homePreviewLead"></span></div><div id="homePreviewTrust" class="home-preview-trust"></div><div class="home-preview-gallery"><div><small id="homePreviewBadge"></small>M&K2026</div></div><div id="homePreviewFooter" class="home-preview-footer"><span id="homePreviewCopyright"></span><div class="home-preview-links"><span id="homePreviewPrivacy">Polityka prywatności</span><span id="homePreviewContact">Kontakt</span><span id="homePreviewHow">Jak działa?</span></div></div></div></aside></div></dialog>`);
}

function normalized(raw={}){return {...DEFAULTS,...raw};} function value(id,val){const el=$("#"+id);if(el) el.value=val??"";} function checked(id,val){const el=$("#"+id);if(el) el.checked=val!==false;}
function fill(raw){const c=normalized(raw); value("homeHeaderTitle",c.headerTitle);value("homeHeaderLead",c.headerLead);value("homePrivateBadgeText",c.privateBadgeText);value("homeTrustText",c.trustText);value("homeCopyrightText",c.copyrightText);value("homePrivacyLabel",c.privacyLabel);value("homePrivacyTitle",c.privacyTitle);value("homePrivacyText",c.privacyText);value("homeContactLabel",c.contactLabel);value("homeContactTitle",c.contactTitle);value("homeContactEmail",c.contactEmail);value("homeContactWebsite",c.contactWebsite);value("homeContactInstagram",c.contactInstagram);value("homeHowLabel",c.howLabel);value("homeHowTitle",c.howTitle);value("homeHowStep1",c.howStep1);value("homeHowStep2",c.howStep2);value("homeHowStep3",c.howStep3);value("homeCoverBlurNumber",c.coverBlur);value("homeCoverBlurRange",c.coverBlur);Object.entries(toggleMap).forEach(([id,key])=>checked(id,c[key]));updatePreview();}
function read(){const getv=id=>String($("#"+id)?.value??"").trim();const c={coverBlur:Math.max(0,Math.min(100,Number($("#homeCoverBlurNumber")?.value||50))),headerTitle:getv("homeHeaderTitle"),headerLead:getv("homeHeaderLead"),privateBadgeText:getv("homePrivateBadgeText"),trustText:getv("homeTrustText"),copyrightText:getv("homeCopyrightText"),privacyLabel:getv("homePrivacyLabel"),privacyTitle:getv("homePrivacyTitle"),privacyText:String($("#homePrivacyText")?.value??"").trim(),contactLabel:getv("homeContactLabel"),contactTitle:getv("homeContactTitle"),contactEmail:getv("homeContactEmail"),contactWebsite:getv("homeContactWebsite"),contactInstagram:getv("homeContactInstagram"),howLabel:getv("homeHowLabel"),howTitle:getv("homeHowTitle"),howStep1:getv("homeHowStep1"),howStep2:getv("homeHowStep2"),howStep3:getv("homeHowStep3")};Object.entries(toggleMap).forEach(([id,key])=>c[key]=$("#"+id)?.checked!==false);return c;}
function updatePreview(){const c=read();$("#homePreviewTitle").textContent=c.headerTitle||DEFAULTS.headerTitle;$("#homePreviewLead").textContent=c.headerLead||DEFAULTS.headerLead;$("#homePreviewLead").hidden=c.showHeaderLead===false;$("#homePreviewTrust").textContent=c.trustText||DEFAULTS.trustText;$("#homePreviewTrust").hidden=c.showTrustBar===false;$("#homePreviewBadge").textContent=c.privateBadgeText||DEFAULTS.privateBadgeText;$("#homePreviewBadge").hidden=c.showPrivateBadge===false;$("#homePreviewCopyright").textContent=c.copyrightText||DEFAULTS.copyrightText;$("#homePreviewCopyright").hidden=c.showCopyright===false;$("#homePreviewPrivacy").textContent=c.privacyLabel||DEFAULTS.privacyLabel;$("#homePreviewPrivacy").hidden=c.showPrivacy===false;$("#homePreviewContact").textContent=c.contactLabel||DEFAULTS.contactLabel;$("#homePreviewContact").hidden=c.showContact===false;$("#homePreviewHow").textContent=c.howLabel||DEFAULTS.howLabel;$("#homePreviewHow").hidden=c.showHow===false;$("#homePreviewFooter").hidden=c.showFooter===false;}
async function loadConfig(){const snap=await get(ref(db,CONFIG_PATH));return snap.exists()?normalized(snap.val()):{...DEFAULTS};}
async function openSettings(){const status=$("#homeSettingsStatus");status.hidden=true;try{fill(await loadConfig());$("#homeSettingsDialog").showModal();}catch(error){console.error(error);status.hidden=false;status.className="home-settings-status error";status.textContent=`Nie udało się wczytać ustawień: ${error.message||error}`;$("#homeSettingsDialog").showModal();}}
async function saveSettings(){const btn=$("#homeSettingsSave"),status=$("#homeSettingsStatus"),old=btn.textContent;btn.disabled=true;btn.textContent="Zapisywanie…";status.hidden=true;try{if(auth.currentUser?.uid!==ADMIN_UID)throw new Error("Brak uprawnień administratora.");await update(ref(db,CONFIG_PATH),read());status.hidden=false;status.className="home-settings-status ok";status.textContent="Ustawienia Strefy klienta zapisane globalnie.";}catch(error){console.error(error);status.hidden=false;status.className="home-settings-status error";status.textContent=`Błąd zapisu: ${error.code||error.message||error}`;}finally{btn.disabled=false;btn.textContent=old;}}
function bind(){$("#homeSettingsBtn")?.addEventListener("click",openSettings);$("#homeSettingsClose")?.addEventListener("click",()=>$("#homeSettingsDialog").close());$("#homeSettingsCancel")?.addEventListener("click",()=>$("#homeSettingsDialog").close());$("#homeSettingsSave")?.addEventListener("click",saveSettings);$("#homeSettingsDefaults")?.addEventListener("click",()=>fill(DEFAULTS));$("#homeSettingsOpen")?.addEventListener("click",()=>window.open(new URL("home.html",location.href),"_blank","noopener"));$("#homeCoverBlurRange")?.addEventListener("input",e=>{value("homeCoverBlurNumber",e.target.value);updatePreview();});$("#homeCoverBlurNumber")?.addEventListener("input",e=>{value("homeCoverBlurRange",e.target.value);updatePreview();});document.querySelectorAll("#homeSettingsDialog input,#homeSettingsDialog textarea").forEach(el=>{el.addEventListener("input",updatePreview);el.addEventListener("change",updatePreview);});}
function init(){injectStyles();injectUi();bind();}
onAuthStateChanged(auth,user=>{if(user?.uid===ADMIN_UID)init();else if($("#homeSettingsBtn"))$("#homeSettingsBtn").hidden=true;});
