import { getApps } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getDatabase, ref, get, set } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";
import { ADMIN_UID } from "./firebase-config.js?v=16.2.4.2.1";

const CONFIG_PATH = "galleries/__system__/public/clientZoneConfig";
const INDEX_PATH = "galleries/__system__/public/galleryIndex";
const DEFAULT_BLUR = 50;

const clamp = value => Math.max(0, Math.min(100, Number(value) || 0));
const blurPx = value => (clamp(value) * 0.4).toFixed(1);

async function waitForFirebaseApp(){
  for (let i = 0; i < 100; i++) {
    const apps = getApps();
    if (apps.length) return apps[0];
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  return null;
}

function injectStyles(){
  if (document.getElementById("clientZoneSettingsStyles")) return;
  const style = document.createElement("style");
  style.id = "clientZoneSettingsStyles";
  style.textContent = `
    .client-zone-settings-dialog{width:min(760px,calc(100% - 20px));}
    .client-zone-settings-body{display:grid;grid-template-columns:minmax(0,1fr) minmax(260px,.75fr);gap:18px;margin-top:16px;}
    .client-zone-setting-card,.client-zone-preview-wrap{border:1px solid #2d2d31;border-radius:18px;background:#101012;padding:16px;}
    .client-zone-setting-card h3{margin:0 0 6px}.client-zone-setting-card .muted{margin:0 0 18px}
    .client-zone-slider-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px}
    .client-zone-slider-head strong{font-size:18px}.client-zone-slider-head output{font-size:22px;font-weight:900}
    #clientZoneBlurRange{width:100%;accent-color:#f5f5f2;cursor:pointer}
    .client-zone-scale{display:flex;justify-content:space-between;margin-top:6px;color:#777;font-size:10px}
    .client-zone-preview-wrap>small{display:block;margin-bottom:10px;color:#888;letter-spacing:.1em;font-weight:800}
    .client-zone-preview{position:relative;height:210px;overflow:hidden;border:1px solid #303036;border-radius:17px;background:#18181b;isolation:isolate}
    .client-zone-preview-cover{position:absolute;inset:-28px;background:#29292d center/cover no-repeat;transform:scale(1.08);z-index:-2}
    .client-zone-preview::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,#0002,#0008 65%,#08080ae8);z-index:-1}
    .client-zone-preview-copy{position:absolute;left:18px;right:18px;bottom:18px}.client-zone-preview-copy small{font-size:8px;letter-spacing:.18em;color:#ccc}.client-zone-preview-copy strong{display:block;margin-top:6px;font-size:25px}
    .client-zone-settings-actions{display:flex;justify-content:flex-end;gap:9px;margin-top:16px}.client-zone-settings-actions .spacer{flex:1}
    @media(max-width:700px){.client-zone-settings-body{grid-template-columns:1fr}.client-zone-preview{height:180px}}
  `;
  document.head.appendChild(style);
}

function injectUi(){
  if (document.getElementById("clientZoneSettingsBtn")) return;
  injectStyles();

  const actions = document.querySelector(".admin-head-actions");
  if (actions) {
    const button = document.createElement("button");
    button.id = "clientZoneSettingsBtn";
    button.type = "button";
    button.className = "ghost";
    button.textContent = "🌐 Strefa klienta";
    const newGallery = document.getElementById("newGalleryBtn");
    actions.insertBefore(button, newGallery || null);
  }

  const dialog = document.createElement("dialog");
  dialog.id = "clientZoneSettingsDialog";
  dialog.className = "dialog client-zone-settings-dialog";
  dialog.innerHTML = `
    <div class="dialog-head">
      <div>
        <p class="eyebrow">STREFA KLIENTA</p>
        <h2>Wygląd strony głównej galerii</h2>
        <p class="muted">Tutaj ustawiasz wygląd kafelków widocznych pod głównym adresem galerii.</p>
      </div>
      <button id="closeClientZoneSettings" type="button" class="ghost close-btn">×</button>
    </div>

    <div class="client-zone-settings-body">
      <section class="client-zone-setting-card">
        <h3>Rozmycie okładek</h3>
        <p class="muted">0% = zdjęcie ostre, 100% = bardzo mocno rozmyte. Obecne domyślne rozmycie to 50%.</p>
        <div class="client-zone-slider-head">
          <strong>Poziom rozmycia</strong>
          <output id="clientZoneBlurValue">50%</output>
        </div>
        <input id="clientZoneBlurRange" type="range" min="0" max="100" step="1" value="50">
        <div class="client-zone-scale"><span>0% — ostre</span><span>100% — maks.</span></div>
      </section>

      <aside class="client-zone-preview-wrap">
        <small>PODGLĄD</small>
        <div class="client-zone-preview">
          <div id="clientZonePreviewCover" class="client-zone-preview-cover"></div>
          <div class="client-zone-preview-copy">
            <small>PRYWATNA GALERIA</small>
            <strong id="clientZonePreviewTitle">Przykładowa galeria</strong>
          </div>
        </div>
      </aside>
    </div>

    <div id="clientZoneSettingsStatus" class="notice" hidden></div>
    <div class="client-zone-settings-actions">
      <button id="clientZoneResetBtn" type="button" class="ghost">Przywróć 50%</button>
      <span class="spacer"></span>
      <button id="clientZoneCancelBtn" type="button" class="ghost">Anuluj</button>
      <button id="clientZoneSaveBtn" type="button" class="primary">Zapisz</button>
    </div>
  `;
  document.body.appendChild(dialog);
}

function updatePreview(value){
  const v = clamp(value);
  const output = document.getElementById("clientZoneBlurValue");
  const cover = document.getElementById("clientZonePreviewCover");
  if (output) output.textContent = `${v}%`;
  if (cover) cover.style.filter = `blur(${blurPx(v)}px) brightness(.56) saturate(.72)`;
}

async function openDialog(db){
  const dialog = document.getElementById("clientZoneSettingsDialog");
  const range = document.getElementById("clientZoneBlurRange");
  const status = document.getElementById("clientZoneSettingsStatus");
  if (!dialog || !range) return;

  status.hidden = true;
  let value = DEFAULT_BLUR;

  try {
    const [configSnap, indexSnap] = await Promise.all([
      get(ref(db, CONFIG_PATH)),
      get(ref(db, INDEX_PATH))
    ]);
    if (configSnap.exists()) value = clamp(configSnap.val()?.coverBlur ?? DEFAULT_BLUR);

    const first = indexSnap.exists() ? Object.values(indexSnap.val() || {}).find(item => item?.coverUrl) : null;
    const cover = document.getElementById("clientZonePreviewCover");
    if (cover && first?.coverUrl) cover.style.backgroundImage = `url("${String(first.coverUrl).replace(/"/g, "%22")}")`;
    const title = document.getElementById("clientZonePreviewTitle");
    if (title && first?.title) title.textContent = first.title;
  } catch (error) {
    console.warn("CLIENT ZONE SETTINGS LOAD ERROR", error);
  }

  range.value = String(value);
  updatePreview(value);
  if (!dialog.open) dialog.showModal();
}

async function start(){
  injectUi();
  const app = await waitForFirebaseApp();
  if (!app) return;

  const auth = getAuth(app);
  const db = getDatabase(app);
  const range = document.getElementById("clientZoneBlurRange");

  range?.addEventListener("input", () => updatePreview(range.value));
  document.getElementById("clientZoneSettingsBtn")?.addEventListener("click", () => openDialog(db));
  document.getElementById("closeClientZoneSettings")?.addEventListener("click", () => document.getElementById("clientZoneSettingsDialog")?.close());
  document.getElementById("clientZoneCancelBtn")?.addEventListener("click", () => document.getElementById("clientZoneSettingsDialog")?.close());
  document.getElementById("clientZoneResetBtn")?.addEventListener("click", () => {
    range.value = String(DEFAULT_BLUR);
    updatePreview(DEFAULT_BLUR);
  });

  document.getElementById("clientZoneSaveBtn")?.addEventListener("click", async () => {
    const status = document.getElementById("clientZoneSettingsStatus");
    const button = document.getElementById("clientZoneSaveBtn");
    if (!auth.currentUser || auth.currentUser.uid !== ADMIN_UID) {
      status.hidden = false;
      status.className = "notice error";
      status.textContent = "Musisz być zalogowany jako administrator.";
      return;
    }

    const value = clamp(range.value);
    const old = button.textContent;
    button.disabled = true;
    button.textContent = "Zapisywanie…";

    try {
      await set(ref(db, CONFIG_PATH), { coverBlur: value, updatedAt: Date.now() });
      status.hidden = false;
      status.className = "notice ok";
      status.textContent = `Zapisano rozmycie okładek: ${value}%.`;
    } catch (error) {
      console.error("CLIENT ZONE SETTINGS SAVE ERROR", error);
      status.hidden = false;
      status.className = "notice error";
      status.textContent = `Błąd zapisu: ${error.code || error.message || error}`;
    } finally {
      button.disabled = false;
      button.textContent = old;
    }
  });
}

start();
