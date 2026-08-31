import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getDatabase, ref, get } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js?v=16.6";

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

function normalize(raw = {}) { return { ...DEFAULTS, ...raw }; }

function injectStyles() {
  if (document.getElementById("rafHomeLegitStyles")) return;
  const style = document.createElement("style");
  style.id = "rafHomeLegitStyles";
  style.textContent = `
    .zone-trust{width:min(1320px,calc(100% - 32px));margin:0 auto 4px;padding:12px 15px;border:1px solid #29292f;border-radius:14px;background:#111114;color:#aaa;font-size:12px;display:flex;align-items:center;justify-content:center;text-align:center;letter-spacing:.01em}
    .zone-footer{justify-content:space-between!important;gap:18px!important;flex-wrap:wrap}.zone-footer-main{display:flex;align-items:center;gap:16px;min-width:0}.zone-footer-main img{width:92px;height:auto}.zone-copyright{font-size:11px;color:#777;line-height:1.45}
    .zone-footer-nav{display:flex;align-items:center;justify-content:flex-end;gap:6px;flex-wrap:wrap}.zone-footer-link{border:0;background:transparent;color:#919198;padding:8px 9px;border-radius:9px;cursor:pointer;font:inherit;font-size:11px}.zone-footer-link:hover{background:#17171a;color:#fff}
    .home-legal-dialog{width:min(680px,calc(100% - 24px));max-height:min(80vh,760px);padding:0;border:1px solid #33333a;border-radius:22px;background:#111113;color:#f5f5f2;box-shadow:0 30px 100px #000c}.home-legal-dialog::backdrop{background:#000b;backdrop-filter:blur(7px)}
    .home-legal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;padding:22px 22px 14px;border-bottom:1px solid #29292f}.home-legal-head h2{margin:3px 0 0;font-size:28px;letter-spacing:-.035em}.home-legal-head small{color:#7e7e85;font-size:9px;letter-spacing:.18em;font-weight:800}.home-legal-close{width:38px;height:38px;border-radius:12px;border:1px solid #34343a;background:#17171a;color:#fff;font-size:22px;cursor:pointer}
    .home-legal-body{padding:20px 22px 24px;color:#b4b4ba;font-size:13px;line-height:1.7;white-space:pre-line}.home-contact-list{display:grid;gap:9px;margin-top:14px}.home-contact-list a,.home-contact-fallback{display:block;padding:12px 14px;border:1px solid #303036;border-radius:12px;background:#151518;color:#eee;text-decoration:none;overflow-wrap:anywhere}.home-contact-list a:hover{border-color:#55555d}.home-how-list{display:grid;gap:10px}.home-how-step{display:grid;grid-template-columns:34px 1fr;gap:11px;align-items:start;padding:12px;border:1px solid #2d2d33;border-radius:13px;background:#151518}.home-how-step b{width:30px;height:30px;border-radius:10px;background:#f3f3f0;color:#111;display:grid;place-items:center}.home-how-step span{padding-top:5px;color:#d2d2d6}
    .gallery-entry-content small[hidden]{display:none!important}
    @media(max-width:620px){.zone-trust{width:calc(100% - 24px);font-size:11px;padding:10px 12px}.zone-footer{align-items:flex-start!important;flex-direction:column}.zone-footer-nav{justify-content:flex-start}.home-legal-head{padding:18px 17px 12px}.home-legal-body{padding:17px}.home-legal-head h2{font-size:24px}}
  `;
  document.head.appendChild(style);
}

function safeUrl(value) {
  const raw = String(value || "").trim(); if (!raw) return "";
  try { const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`; const url = new URL(candidate); return ["http:", "https:"].includes(url.protocol) ? url.toString() : ""; } catch (_) { return ""; }
}

function ensureUi() {
  let trust = document.getElementById("zoneTrust");
  if (!trust) { trust = document.createElement("div"); trust.id = "zoneTrust"; trust.className = "zone-trust"; $(".zone-main")?.before(trust); }
  const footer = $(".zone-footer");
  if (footer && !document.getElementById("zoneFooterMain")) footer.innerHTML = `<div id="zoneFooterMain" class="zone-footer-main"><img id="zoneFooterLogo" src="logo-white.png" alt="RAF.studio"><span id="zoneCopyright" class="zone-copyright"></span></div><nav id="zoneFooterNav" class="zone-footer-nav" aria-label="Informacje"><button id="zonePrivacyBtn" class="zone-footer-link" type="button"></button><button id="zoneContactBtn" class="zone-footer-link" type="button"></button><button id="zoneHowBtn" class="zone-footer-link" type="button"></button></nav>`;
  if (!document.getElementById("homeLegalDialog")) {
    document.body.insertAdjacentHTML("beforeend", `<dialog id="homeLegalDialog" class="home-legal-dialog"><div class="home-legal-head"><div><small>RAF.STUDIO</small><h2 id="homeLegalTitle"></h2></div><button id="homeLegalClose" class="home-legal-close" type="button" aria-label="Zamknij">×</button></div><div id="homeLegalBody" class="home-legal-body"></div></dialog>`);
    $("#homeLegalClose")?.addEventListener("click", () => $("#homeLegalDialog")?.close());
    $("#homeLegalDialog")?.addEventListener("click", event => { if (event.target === $("#homeLegalDialog")) $("#homeLegalDialog").close(); });
  }
}

function openDialog(title, contentNode) { const dialog = $("#homeLegalDialog"), body = $("#homeLegalBody"); $("#homeLegalTitle").textContent = title; body.innerHTML = ""; if (typeof contentNode === "string") body.textContent = contentNode; else body.appendChild(contentNode); if (!dialog.open) dialog.showModal(); }
function renderPrivacy(cfg) { openDialog(cfg.privacyTitle || DEFAULTS.privacyTitle, cfg.privacyText || DEFAULTS.privacyText); }
function renderContact(cfg) {
  const wrap = document.createElement("div"), intro = document.createElement("div"); intro.textContent = "W sprawach dotyczących galerii, zdjęć lub prywatności skontaktuj się z RAF.studio."; wrap.appendChild(intro);
  const list = document.createElement("div"); list.className = "home-contact-list"; let count = 0;
  if (String(cfg.contactEmail || "").trim()) { const a = document.createElement("a"); a.href = `mailto:${String(cfg.contactEmail).trim()}`; a.textContent = `E-mail: ${String(cfg.contactEmail).trim()}`; list.appendChild(a); count++; }
  const website = safeUrl(cfg.contactWebsite); if (website) { const a = document.createElement("a"); a.href = website; a.target = "_blank"; a.rel = "noopener"; a.textContent = "Strona internetowa"; list.appendChild(a); count++; }
  const instagram = safeUrl(cfg.contactInstagram); if (instagram) { const a = document.createElement("a"); a.href = instagram; a.target = "_blank"; a.rel = "noopener"; a.textContent = "Instagram"; list.appendChild(a); count++; }
  if (!count) { const fallback = document.createElement("div"); fallback.className = "home-contact-fallback"; fallback.textContent = "Skontaktuj się z fotografem przez kanał, którym otrzymałeś link do galerii."; list.appendChild(fallback); }
  wrap.appendChild(list); openDialog(cfg.contactTitle || DEFAULTS.contactTitle, wrap);
}
function renderHow(cfg) { const list = document.createElement("div"); list.className = "home-how-list"; [cfg.howStep1,cfg.howStep2,cfg.howStep3].filter(Boolean).forEach((text,index)=>{ const row=document.createElement("div"); row.className="home-how-step"; const number=document.createElement("b"); number.textContent=String(index+1); const copy=document.createElement("span"); copy.textContent=text; row.append(number,copy); list.appendChild(row); }); openDialog(cfg.howTitle || DEFAULTS.howTitle, list); }
function updateGalleryBadges(cfg) { document.querySelectorAll(".gallery-entry-content small").forEach(label => { label.textContent = cfg.privateBadgeText || DEFAULTS.privateBadgeText; label.hidden = cfg.showPrivateBadge === false; }); }

function applyConfig(raw) {
  const cfg = normalize(raw); ensureUi();
  const title = $(".zone-head h1"), lead = $(".zone-lead"); if (title) title.textContent = cfg.headerTitle || DEFAULTS.headerTitle; if (lead) { lead.textContent = cfg.headerLead || DEFAULTS.headerLead; lead.hidden = cfg.showHeaderLead === false; }
  const count = $("#galleryCount"); if (count) count.hidden = cfg.showGalleryCount === false; const search = $(".zone-search"); if (search) search.hidden = cfg.showSearch === false;
  const trust = $("#zoneTrust"); if (trust) { trust.textContent = cfg.trustText || DEFAULTS.trustText; trust.hidden = cfg.showTrustBar === false; }
  const footer = $(".zone-footer"); if (footer) footer.hidden = cfg.showFooter === false; const footerLogo = $("#zoneFooterLogo"); if (footerLogo) footerLogo.hidden = cfg.showFooterLogo === false; const copyright = $("#zoneCopyright"); if (copyright) { copyright.textContent = cfg.copyrightText || DEFAULTS.copyrightText; copyright.hidden = cfg.showCopyright === false; }
  const privacyBtn = $("#zonePrivacyBtn"); if (privacyBtn) { privacyBtn.textContent = cfg.privacyLabel || DEFAULTS.privacyLabel; privacyBtn.hidden = cfg.showPrivacy === false; privacyBtn.onclick = () => renderPrivacy(cfg); }
  const contactBtn = $("#zoneContactBtn"); if (contactBtn) { contactBtn.textContent = cfg.contactLabel || DEFAULTS.contactLabel; contactBtn.hidden = cfg.showContact === false; contactBtn.onclick = () => renderContact(cfg); }
  const howBtn = $("#zoneHowBtn"); if (howBtn) { howBtn.textContent = cfg.howLabel || DEFAULTS.howLabel; howBtn.hidden = cfg.showHow === false; howBtn.onclick = () => renderHow(cfg); }
  const nav = $("#zoneFooterNav"); if (nav) nav.hidden = [cfg.showPrivacy,cfg.showContact,cfg.showHow].every(v => v === false);
  updateGalleryBadges(cfg); const observer = new MutationObserver(() => updateGalleryBadges(cfg)); const directory = $("#galleryDirectory"); if (directory) observer.observe(directory, { childList:true, subtree:true });
}

async function init() { injectStyles(); ensureUi(); try { if (!auth.currentUser) await signInAnonymously(auth); const snap = await get(ref(db, CONFIG_PATH)); applyConfig(snap.exists() ? snap.val() : DEFAULTS); } catch (error) { console.warn("HOME LEGIT CONFIG ERROR", error); applyConfig(DEFAULTS); } }
init();
