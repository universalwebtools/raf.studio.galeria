import "./client-zone-settings.js?v=16.4.2";
import { getApps } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getDatabase, ref, onValue, set } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";
import { ADMIN_UID } from "./firebase-config.js?v=16.2.4.2.1";

const INDEX_PATH = "galleries/__system__/public/galleryIndex";

function stable(value){
  if (!value || typeof value !== "object") return JSON.stringify(value);
  const sorted = Object.keys(value).sort().reduce((acc,key) => {
    acc[key] = value[key];
    return acc;
  }, {});
  return JSON.stringify(sorted);
}

function buildIndex(all){
  const result = {};

  Object.entries(all || {}).forEach(([slug, gallery]) => {
    if (slug.startsWith("__system__")) return;
    const pub = gallery?.public;
    if (!pub) return;

    const photos = Object.values(pub.photos || {}).filter(Boolean);
    const cover = photos.find(photo => photo?.filename === pub.coverFile) || photos[0] || null;

    result[slug] = {
      slug,
      title: String(pub.title || slug),
      coverUrl: String(cover?.previewUrl || ""),
      enabled: pub.enabled !== false,
      expiresAt: pub.expiresAt || "",
      updatedAt: Number(pub.updatedAt || Date.now())
    };
  });

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
  let busy = false;

  onAuthStateChanged(auth, user => {
    if (!user || user.uid !== ADMIN_UID) return;

    onValue(ref(db, "galleries"), async snap => {
      if (busy) return;
      const all = snap.val() || {};
      const nextIndex = buildIndex(all);
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
