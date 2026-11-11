import { getApps } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getDatabase, ref, get, set } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";
import { ADMIN_UID } from "./firebase-config.js?v=17.0";

// Strefa klienta nie pokazuje już publicznej listy galerii. Ten moduł usuwa
// ewentualny stary publiczny indeks i wczytuje dodatkowe moduły panelu.
const INDEX_PATH = "galleries/__system__/public/galleryIndex";

async function start() {
  for (let i = 0; i < 160 && !getApps().length; i++) await new Promise(resolve => setTimeout(resolve, 25));
  const app = getApps()[0];
  if (!app) return;
  const auth = getAuth(app);
  const db = getDatabase(app);
  onAuthStateChanged(auth, async user => {
    if (!user || user.uid !== ADMIN_UID) return;
    try {
      if ((await get(ref(db, INDEX_PATH))).exists()) await set(ref(db, INDEX_PATH), null);
    } catch (error) {
      console.warn("RAF.studio: nie usunięto starego indeksu galerii", error?.code || error);
    }
  });
}

start();

// Kosz i karta linku.
import("./admin-premium-v17.js?v=25.0").catch(error => console.warn("RAF premium v17 load failed", error));
// Szablony, status klienta i statystyki.
import("./admin-premium-v18.1.js?v=18.1").catch(error => console.warn("RAF premium v18.1 load failed", error));
// Instalacja panelu na telefonie + powiadomienia PUSH.
import("./admin-pwa-v20.js?v=20.0.1").catch(error => console.warn("RAF PWA v20 load failed", error));
