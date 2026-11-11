import { ref, get, remove, update } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";

// Gałęzie bazy trzymane osobno dla każdej galerii: {root}/{slug}.
const PER_GALLERY_ROOTS = ["favorites", "selections", "approvals", "clientAnalytics", "unlockAttempts"];

// Usuwa z bazy wszystkie dane klientów powiązane z galerią (bez samej galerii
// i bez plików w Storage). Błąd jednej gałęzi nie przerywa pozostałych.
export async function cleanupGalleryData(db, slug) {
  if (!slug) return;

  const tasks = PER_GALLERY_ROOTS.map(root =>
    remove(ref(db, `${root}/${slug}`)).catch(error => {
      console.warn("GALLERY CLEANUP ERROR", `${root}/${slug}`, error?.code || error);
    })
  );

  // Wpisy dostępu są pogrupowane po kliencie: access/{uid}/{slug}.
  tasks.push((async () => {
    const snap = await get(ref(db, "access"));
    const patch = {};
    snap.forEach(client => {
      if (client.hasChild(slug)) patch[`${client.key}/${slug}`] = null;
    });
    if (Object.keys(patch).length) await update(ref(db, "access"), patch);
  })().catch(error => {
    console.warn("GALLERY CLEANUP ERROR", "access", error?.code || error);
  }));

  await Promise.all(tasks);
}
