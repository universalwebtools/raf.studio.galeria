from pathlib import Path
import re

root = Path('.')

def read(name): return (root/name).read_text(encoding='utf-8')
def write(name,text): (root/name).write_text(text,encoding='utf-8')
def rep(text, old, new, label):
    if old not in text:
        raise RuntimeError(f'Missing expected block: {label}')
    return text.replace(old,new,1)

# APP.JS
text=read('app.js')
text=text.replace('hidden: "Ukryte",','hidden: "Odrzucone",',1)
text=rep(text, '''function saveRejectedState() {
  localStorage.setItem(storageKeyRejected(), JSON.stringify([...rejected]));
}
''', '''function saveRejectedState() {
  localStorage.setItem(storageKeyRejected(), JSON.stringify([...rejected]));
}

function rejectedSelectionKey(filename) {
  return `rej_${selectionKey(filename)}`;
}

function isRejectedSelectionItem(item) {
  return Boolean(item?.filename) && Number(item?.selectedAt || 0) < 0;
}

function normalizedSharedRejected(raw) {
  const currentByExact = new Map(photos.map(photo => [String(photo.filename), photo.filename]));
  const currentByBase = new Map(photos.map(photo => [displayName(photo.filename).toLowerCase(), photo.filename]));
  const result = new Set();

  Object.values(raw || {}).forEach(item => {
    if (!isRejectedSelectionItem(item)) return;
    const canonical = currentByExact.get(String(item.filename)) ||
      currentByBase.get(displayName(item.filename).toLowerCase());
    if (canonical) result.add(canonical);
  });

  return result;
}

async function migrateLocalRejectedToShared() {
  const localItems = [...rejected];
  if (!localItems.length) return;

  try {
    await Promise.all(localItems.map(filename =>
      set(ref(db, `selections/${slug}/${rejectedSelectionKey(filename)}`), {
        filename,
        selectedAt: -Date.now()
      })
    ));
    localStorage.removeItem(storageKeyRejected());
  } catch (error) {
    console.warn("REJECTED LOCAL MIGRATION ERROR", error);
  }
}
''', 'shared rejected helpers')
text=rep(text, '''  Object.values(raw || {}).forEach(item => {
    if (!item?.filename) return;

    const canonical = currentByExact.get(String(item.filename)) ||
''', '''  Object.values(raw || {}).forEach(item => {
    if (!item?.filename || isRejectedSelectionItem(item)) return;

    const canonical = currentByExact.get(String(item.filename)) ||
''', 'favorite filtering')
text=rep(text, '''async function loadFavorites() {
  try {
    const snap = await get(ref(db, `selections/${slug}`));
    favorites = normalizedSharedFavorites(snap.exists() ? snap.val() : {});
  } catch (error) {
    console.error("LOAD FAVORITES ERROR", error);
  }
}
''', '''async function loadFavorites() {
  try {
    const snap = await get(ref(db, `selections/${slug}`));
    const raw = snap.exists() ? snap.val() : {};
    const sharedRejected = normalizedSharedRejected(raw);
    const localRejected = new Set(rejected);
    favorites = normalizedSharedFavorites(raw);
    rejected = new Set([...sharedRejected, ...localRejected]);
    if (localRejected.size) await migrateLocalRejectedToShared();
  } catch (error) {
    console.error("LOAD FAVORITES ERROR", error);
  }
}
''', 'load favorites/rejected')
text=rep(text, '''  try {
    await remove(ref(db, `selections/${slug}`));
    favorites.clear();
    toast("Wyczyszczono wszystkie serduszka");
''', '''  try {
    await Promise.all([...favorites.keys()].map(filename =>
      remove(ref(db, `selections/${slug}/${selectionKey(filename)}`))
    ));
    favorites.clear();
    toast("Wyczyszczono wszystkie serduszka — odrzucone zdjęcia zostały zachowane");
''', 'clear hearts preserves rejected')
text=rep(text, '''    (snapshot) => {
      favorites = normalizedSharedFavorites(snapshot.exists() ? snapshot.val() : {});
      if (galleryLoaded) {
''', '''    (snapshot) => {
      const raw = snapshot.exists() ? snapshot.val() : {};
      favorites = normalizedSharedFavorites(raw);
      rejected = normalizedSharedRejected(raw);
      saveRejectedState();
      if (galleryLoaded) {
''', 'watch favorites/rejected')
text=text.replace('filter === "hidden" ? "Nie ukryto żadnych zdjęć."','filter === "hidden" ? "Nie odrzucono żadnych zdjęć."',1)
text=text.replace('rejectBtn.title = isRejected ? "Przywróć zdjęcie" : "Ukryj / odrzuć zdjęcie";','rejectBtn.title = isRejected ? "Przywróć odrzucone zdjęcie" : "Odrzuć zdjęcie — nie używać";',1)
text=rep(text, '''    rejectBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleRejected(photo.filename);
    });''', '''    rejectBtn.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await toggleRejected(photo.filename);
    });''', 'card reject click')
text=rep(text, '''async function toggleFavorite(filename) {
  if (currentUiConfig.showHeartButton === false) return;
  const wasSelected = favorites.has(filename);

  if (!wasSelected && maxFavorites() > 0 && favorites.size >= maxFavorites()) {
''', '''async function toggleFavorite(filename) {
  if (currentUiConfig.showHeartButton === false) return;
  const wasSelected = favorites.has(filename);

  if (!wasSelected && rejected.has(filename)) {
    try {
      await remove(ref(db, `selections/${slug}/${rejectedSelectionKey(filename)}`));
      rejected.delete(filename);
      saveRejectedState();
    } catch (error) {
      console.error("RESTORE BEFORE FAVORITE ERROR", error);
      toast("Nie udało się przywrócić odrzuconego zdjęcia.");
      return;
    }
  }

  if (!wasSelected && maxFavorites() > 0 && favorites.size >= maxFavorites()) {
''', 'favorite restores rejected')
pat=re.compile(r'''function toggleRejected\(filename\) \{.*?\n\}\n\nfunction toggleCompareSelection''',re.S)
replacement='''async function toggleRejected(filename) {
  if (currentUiConfig.showRejectButton === false) return;

  const wasRejected = rejected.has(filename);
  const previousFavorite = favorites.get(filename) || null;
  const rejectTarget = ref(db, `selections/${slug}/${rejectedSelectionKey(filename)}`);
  const favoriteTarget = ref(db, `selections/${slug}/${selectionKey(filename)}`);

  if (wasRejected) {
    rejected.delete(filename);
  } else {
    rejected.add(filename);
    favorites.delete(filename);
    downloadSelection.delete(filename);
    compareSelection = compareSelection.filter(name => name !== filename);
  }

  saveRejectedState();
  render();
  updateUI();

  try {
    if (wasRejected) {
      await remove(rejectTarget);
      toast("Przywrócono zdjęcie");
    } else {
      await Promise.all([
        set(rejectTarget, { filename, selectedAt: -Date.now() }),
        previousFavorite ? remove(favoriteTarget) : Promise.resolve()
      ]);
      toast("Zdjęcie odrzucone — fotograf zobaczy je na liście odrzuconych");
    }
  } catch (error) {
    console.error("REJECT WRITE ERROR", error);
    if (wasRejected) rejected.add(filename);
    else {
      rejected.delete(filename);
      if (previousFavorite) favorites.set(filename, previousFavorite);
    }
    saveRejectedState();
    render();
    updateUI();
    toast(`Nie udało się zapisać odrzucenia: ${error.code || error.message || error}`);
  }
}

function toggleCompareSelection'''
text,n=pat.subn(replacement,text,count=1)
if n!=1: raise RuntimeError('Could not replace toggleRejected')
text=rep(text, '''$("#lightboxReject")?.addEventListener("click", () => {
  const photo = photos[currentIndex];
  if (!photo) return;
  toggleRejected(photo.filename);
  updateLightboxUI();
});''', '''$("#lightboxReject")?.addEventListener("click", async () => {
  const photo = photos[currentIndex];
  if (!photo) return;
  await toggleRejected(photo.filename);
  updateLightboxUI();
});''', 'lightbox reject')
write('app.js',text)

# INDEX.HTML
text=read('index.html').replace('style.css?v=16.2.5','style.css?v=16.3.0').replace('app.js?v=16.2.5','app.js?v=16.3.0')
text=text.replace('<button id="hiddenFilter" type="button" class="seg">Ukryte</button>','<button id="hiddenFilter" type="button" class="seg">Odrzucone</button>')
write('index.html',text)

# ADMIN.JS
text=read('admin.js')
text=text.replace('hidden: "Ukryte",','hidden: "Odrzucone",',1)
text=rep(text, '''  const consume = (item) => {
    if (!item?.filename) return;
    const filename = canonicalFilename(item.filename);
''', '''  const consume = (item) => {
    if (!item?.filename || Number(item?.selectedAt || 0) < 0) return;
    const filename = canonicalFilename(item.filename);
''', 'admin ignore negative rejected')
text=rep(text, '''function selectionCountForSlug(slug) {
  return mergedSelectionForSlug(slug).length;
}
''', '''function rejectedForSlug(slug) {
  const gallery = galleries[slug] || {};
  const currentSelection = selectionsRoot?.[slug] || {};
  const manifest = Object.values(gallery.public?.photos || {}).filter(item => item?.filename);
  const byExact = new Map(manifest.map(item => [String(item.filename), item.filename]));
  const byBase = new Map(manifest.map(item => [displayName(item.filename).toLowerCase(), item.filename]));
  const result = new Map();

  Object.values(currentSelection || {}).forEach(item => {
    if (!item?.filename || Number(item?.selectedAt || 0) >= 0) return;
    const filename = byExact.get(String(item.filename)) ||
      byBase.get(displayName(item.filename).toLowerCase());
    if (!filename) return;
    result.set(displayName(filename).toLowerCase(), {
      ...item,
      filename,
      rejectedAt: Math.abs(Number(item.selectedAt || 0))
    });
  });

  return [...result.values()].sort((a,b) =>
    displayName(a.filename).localeCompare(displayName(b.filename), undefined, { numeric:true })
  );
}

function nonRejectedForSlug(slug) {
  const rejectedNames = new Set(rejectedForSlug(slug).map(item => displayName(item.filename).toLowerCase()));
  return Object.values(galleries[slug]?.public?.photos || {})
    .filter(item => item?.filename && !rejectedNames.has(displayName(item.filename).toLowerCase()))
    .sort((a,b) => displayName(a.filename).localeCompare(displayName(b.filename), undefined, { numeric:true }))
    .map(item => ({ filename: item.filename }));
}

function selectionCountForSlug(slug) {
  return mergedSelectionForSlug(slug).length;
}
''', 'admin rejected helpers')
text=rep(text, '''  items.forEach(item => {
    cleanSelection[manifestKey(item.filename)] = {
      filename: item.filename,
      selectedAt: Number(item.selectedAt || Date.now())
    };
  });

  try {
''', '''  items.forEach(item => {
    cleanSelection[manifestKey(item.filename)] = {
      filename: item.filename,
      selectedAt: Number(item.selectedAt || Date.now())
    };
  });

  Object.entries(selectionsRoot?.[slug] || {}).forEach(([key, item]) => {
    if (!item?.filename || Number(item?.selectedAt || 0) >= 0) return;
    cleanSelection[key] = {
      filename: item.filename,
      selectedAt: Number(item.selectedAt)
    };
  });

  try {
''', 'migration preserves rejected')
pat=re.compile(r'''async function openSelections\(slug\) \{.*?\n\}\n\n\$\("#closeSelectionDialog"\)''',re.S)
new_open='''async function openSelections(slug) {
  const gallery = galleries[slug] || {};
  const container = $("#selectionContent");
  $("#selectionTitle").textContent = `${gallery.public?.title || slug} — wybór, odrzucone i zatwierdzenia klienta`;
  container.innerHTML = '<div class="loading">Ładowanie wyboru…</div>';
  $("#selectionDialog").showModal();

  const items = await migrateLegacyFavoritesToShared(slug);
  const rejectedItems = rejectedForSlug(slug);
  const remainingItems = nonRejectedForSlug(slug);
  const approvals = approvalRowsForSlug(slug);
  container.innerHTML = "";

  const summary = document.createElement("section");
  summary.className = "selection-overview-grid";
  summary.innerHTML = `
    <article class="selection-overview-card"><small>♥ Wybrane do obróbki</small><strong>${items.length}</strong></article>
    <article class="selection-overview-card rejected"><small>× Odrzucone</small><strong>${rejectedItems.length}</strong></article>
    <article class="selection-overview-card remaining"><small>✓ Nieodrzucone</small><strong>${remainingItems.length}</strong></article>
  `;
  container.appendChild(summary);

  const approvalSection = document.createElement("section");
  approvalSection.className = "approval-history";
  if (!approvals.length) {
    approvalSection.innerHTML = '<div class="notice">Klient nie zatwierdził jeszcze ostatecznego wyboru do obróbki.</div>';
  } else {
    approvalSection.innerHTML = `
      <div class="approval-history-head"><div><p class="eyebrow">LOG ZATWIERDZEŃ</p><h3>Historia zatwierdzonych wyborów</h3></div><strong>${approvals.length} ${approvals.length === 1 ? "zatwierdzenie" : "zatwierdzeń"}</strong></div>
      <div class="approval-history-list">${approvals.map((row,index) => `
        <article class="approval-log-row${index === 0 ? " latest" : ""}"><div><b>${index === 0 ? "NAJNOWSZE • " : ""}${Number(row.selectedCount || 0)} zdjęć</b><span>${escapeHtml(formatDateTimePl(row.submittedAt))}</span></div><details><summary>Pokaż zapisane nazwy (${Object.keys(row.filenames || {}).length})</summary><div class="approval-filenames">${Object.values(row.filenames || {}).map(item => `<span>${escapeHtml(displayName(item?.filename))}</span>`).join("")}</div></details></article>`).join("")}</div>`;
  }
  container.appendChild(approvalSection);

  const rejectedSection = document.createElement("section");
  rejectedSection.className = "selection-client selection-single rejection-section";
  rejectedSection.innerHTML = `
    <div class="selection-single-head"><div><h3>× Zdjęcia odrzucone przez klienta</h3><div class="gallery-meta"><span>${rejectedItems.length} zdjęć — klient nie chce, aby były wykorzystywane</span></div></div><div class="selection-admin-actions"><button type="button" class="ghost copy-rejected">Kopiuj listę odrzuconych</button></div></div>
    <div class="rejected-name-list"></div>`;
  const rejectedList = rejectedSection.querySelector(".rejected-name-list");
  rejectedList.innerHTML = rejectedItems.length ? rejectedItems.map(item => `<span>${escapeHtml(displayName(item.filename))}</span>`).join("") : '<div class="notice">Klient nie odrzucił żadnego zdjęcia.</div>';
  rejectedSection.querySelector(".copy-rejected").addEventListener("click", async () => {
    const value = rejectedItems.map(item => displayName(item.filename)).join("\\n");
    if (!value) return toast("Brak odrzuconych zdjęć do skopiowania");
    await navigator.clipboard.writeText(value);
    toast(`Skopiowano ${rejectedItems.length} numerów odrzuconych zdjęć`);
  });
  container.appendChild(rejectedSection);

  const remainingSection = document.createElement("section");
  remainingSection.className = "selection-client selection-single remaining-section";
  remainingSection.innerHTML = `
    <div class="selection-single-head"><div><h3>✓ Zdjęcia pozostawione przez klienta</h3><div class="gallery-meta"><span>${remainingItems.length} zdjęć — wszystkie widoczne w galerii poza odrzuconymi</span></div></div><div class="selection-admin-actions"><button type="button" class="ghost copy-remaining">Kopiuj listę pozostawionych</button><button type="button" class="primary download-remaining">↓ Pobierz nieodrzucone (${remainingItems.length})</button></div></div>`;
  remainingSection.querySelector(".copy-remaining").addEventListener("click", async () => {
    const value = remainingItems.map(item => displayName(item.filename)).join("\\n");
    if (!value) return toast("Brak zdjęć do skopiowania");
    await navigator.clipboard.writeText(value);
    toast(`Skopiowano ${remainingItems.length} numerów pozostawionych zdjęć`);
  });
  remainingSection.querySelector(".download-remaining").addEventListener("click", (event) => {
    if (!remainingItems.length) return toast("Brak nieodrzuconych zdjęć do pobrania");
    downloadAdminSelected(slug, remainingItems, event.currentTarget);
  });
  container.appendChild(remainingSection);

  const block = document.createElement("section");
  block.className = "selection-client selection-single";
  block.innerHTML = `<div class="selection-single-head"><div><h3>♥ Aktualnie wybrane zdjęcia klienta</h3><div class="gallery-meta"><span>${items.length} zdjęć</span></div></div><button type="button" class="primary download-all" ${items.length ? "" : "disabled"}>♥ Pobierz wybrane (${items.length})</button></div><div class="selection-photo-grid"></div>`;
  const grid = block.querySelector(".selection-photo-grid");
  if (!items.length) grid.innerHTML = '<div class="notice">Aktualnie klient nie ma żadnych serduszek.</div>';
  for (const item of items) {
    const manifestItems = Object.values({ ...(gallery.public?.photos || {}), ...(gallery.privatePhotos || {}) });
    const manifestItem = manifestItems.find(photo => photo?.filename === item.filename) || manifestItems.find(photo => displayName(photo?.filename).toLowerCase() === displayName(item.filename).toLowerCase());
    const card = document.createElement("article");
    card.className = "selection-photo-card";
    card.innerHTML = `<div class="selection-photo-thumb" ${manifestItem?.previewUrl ? `style="background-image:url('${manifestItem.previewUrl}')"` : ""}></div><div class="selection-photo-info"><strong>${escapeHtml(displayName(item.filename))}</strong><button type="button" class="ghost download-one">↓ Pobierz</button></div>`;
    card.querySelector(".download-one").addEventListener("click", async () => {
      const url = await getAdminPhotoDownloadUrl(slug, item.filename);
      if (url) startAdminAttachmentDownload(url, item.filename); else toast(`Nie znaleziono pliku ${displayName(item.filename)}`);
    });
    grid.appendChild(card);
  }
  block.querySelector(".download-all").addEventListener("click", (event) => { if (items.length) downloadAdminSelected(slug, items, event.currentTarget); });
  container.appendChild(block);
}

$("#closeSelectionDialog")'''
text,n=pat.subn(new_open,text,count=1)
if n!=1: raise RuntimeError('Could not replace openSelections')
write('admin.js',text)

# ADMIN.HTML
text=read('admin.html').replace('style.css?v=16.2.5','style.css?v=16.3.0').replace('admin.js?v=16.2.5','admin.js?v=16.3.0')
text=text.replace('<input id="uiLabelHidden" value="Ukryte">','<input id="uiLabelHidden" value="Odrzucone">')
write('admin.html',text)

# STYLE.CSS
text=read('style.css') + r'''

/* ===== v16.3.0: SHARED REJECTED PHOTOS ===== */
.photo-card.rejected{opacity:.48;filter:saturate(.55)}
.photo-reject.active,#lightboxReject.active{background:#9b313b!important;border-color:#d65360!important;color:#fff!important}
.selection-overview-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:14px}
.selection-overview-card{display:grid;gap:5px;padding:14px 16px;border:1px solid #2d2d31;border-radius:14px;background:#111114}
.selection-overview-card small{color:#94949b;font-size:11px}.selection-overview-card strong{font-size:28px}
.selection-overview-card.rejected{border-color:#61343a;background:#181113}.selection-overview-card.rejected strong{color:#ff8e98}
.selection-overview-card.remaining{border-color:#345a43;background:#101713}.selection-overview-card.remaining strong{color:#8ad7a5}
.selection-admin-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
.rejected-name-list{display:flex;flex-wrap:wrap;gap:7px;margin-top:12px}
.rejected-name-list>span{padding:7px 9px;border:1px solid #593037;border-radius:9px;background:#1c1114;color:#ffb1b8;font-size:11px;font-weight:700}
.rejection-section{border-color:#512d33!important}.remaining-section{border-color:#2e503a!important}
@media(max-width:760px){.selection-overview-grid{grid-template-columns:1fr 1fr 1fr;gap:6px}.selection-overview-card{padding:10px 8px;text-align:center}.selection-overview-card small{font-size:9px}.selection-overview-card strong{font-size:21px}.selection-admin-actions{width:100%}.selection-admin-actions>*{flex:1 1 150px}}
'''
write('style.css',text)

print('RAF v16.3.0 patch applied')
