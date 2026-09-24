import { getApps } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getDatabase, ref, onValue, set } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";
import { getStorage, ref as sRef, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js";
import { ADMIN_UID } from "./firebase-config.js?v=17.0";

const INDEX_PATH = "galleries/__system__/public/galleryIndex";

function stable(value){
  if (!value || typeof value !== "object") return JSON.stringify(value);
  const sorted = Object.keys(value).sort().reduce((acc,key) => {
    acc[key] = value[key];
    return acc;
  }, {});
  return JSON.stringify(sorted);
}

async function buildIndex(all, storage){
  const result = {};

  for (const [slug, gallery] of Object.entries(all || {})) {
    if (slug.startsWith("__system__")) continue;
    const pub = gallery?.public;
    if (!pub || pub.trashedAt) continue;

    const photos = Object.values(pub.photos || {}).filter(photo =>
      photo?.filename && photo.hiddenFromClient !== true
    );
    const preferredFile = pub.coverFile || pub.heroBackgroundFile || photos[0]?.filename || "";
    const cover =
      photos.find(photo => photo?.filename === preferredFile) ||
      photos.find(photo => photo?.previewUrl) ||
      photos[0] ||
      null;

    let coverUrl = String(cover?.previewUrl || "");
    const coverFile = String(cover?.filename || preferredFile || "");

    if (!coverUrl && coverFile) {
      try {
        coverUrl = await getDownloadURL(
          sRef(storage, `galleries/${slug}/previews/${coverFile}.webp`)
        );
      } catch (error) {
        console.warn("RAF.studio index cover fallback failed:", slug, error);
      }
    }

    result[slug] = {
      slug,
      title: String(pub.title || slug),
      coverUrl,
      coverFile,
      enabled: pub.enabled !== false && pub.active !== false,
      homeHidden: pub.homeHidden === true,
      homeOrder: Number.isFinite(Number(pub.homeOrder)) ? Number(pub.homeOrder) : 999999,
      expiresAt: pub.expiresAt || "",
      updatedAt: Number(pub.updatedAt || Date.now())
    };
  }

  return result;
}

async function waitForFirebaseApp(){
  for (let i = 0; i < 100; i++) {
    const apps = getApps();
    if (apps.length) return apps[0];
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  return null;
}

async function start(){
  const app = await waitForFirebaseApp();
  if (!app) return;

  const auth = getAuth(app);
  const db = getDatabase(app);
  const storage = getStorage(app);
  let busy = false;

  onAuthStateChanged(auth, user => {
    if (!user || user.uid !== ADMIN_UID) return;

    onValue(ref(db, "galleries"), async snap => {
      if (busy) return;
      const all = snap.val() || {};
      const nextIndex = await buildIndex(all, storage);
      const currentIndex = all?.__system__?.public?.galleryIndex || {};

      if (stable(nextIndex) === stable(currentIndex)) return;

      busy = true;
      try {
        await set(ref(db, INDEX_PATH), nextIndex);
        console.info("RAF.studio gallery index synced:", Object.keys(nextIndex).length);
      } catch (error) {
        console.warn("RAF.studio gallery index sync failed", error);
      } finally {
        busy = false;
      }
    });
  });
}

start();

// Premium Studio v17: ukrywanie galerii z home, kosz, kolejność home i karta udostępniania.
import("./admin-premium-v17.js?v=17.0").catch(error => console.warn("RAF premium v17 load failed", error));
// Premium Studio v18.1 SAFE: szablony, status klienta i statystyki bez rekurencyjnego MutationObservera.
import("./admin-premium-v18.1.js?v=18.1").catch(error => console.warn("RAF premium v18.1 load failed", error));
