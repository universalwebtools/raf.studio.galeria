from pathlib import Path

p=Path('app.js')
s=p.read_text(encoding='utf-8')

def one(old,new,label):
    global s
    c=s.count(old)
    if c!=1: raise RuntimeError(f'{label}: {c}')
    s=s.replace(old,new,1)

def between(a,b,new,label):
    global s
    i=s.find(a); j=s.find(b,i)
    if i<0 or j<0: raise RuntimeError(label)
    s=s[:i]+new.rstrip()+'\n\n'+s[j:]

s=s.replace('./firebase-config.js?v=16.2.4.2.1','./firebase-config.js?v=16.3.0')
one('    hidden: "Ukryte",','    hidden: "Odrzucone",','label')
one('  const labels = { ...DEFAULT_UI_CONFIG.labels, ...(stored.labels || {}) };\n  return {','  const labels = { ...DEFAULT_UI_CONFIG.labels, ...(stored.labels || {}) };\n  if (!stored.labels?.hidden || stored.labels.hidden === "Ukryte") labels.hidden = "Odrzucone";\n  return {','stored label')
one('''function selectionKey(filename) {
  const bytes = new TextEncoder().encode(filename);
  let binary = "";
  bytes.forEach(b => binary += String.fromCharCode(b));
  return btoa(binary).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/g, "");
}
''','''function selectionKey(filename) {
  const bytes = new TextEncoder().encode(filename);
  let binary = "";
  bytes.forEach(b => binary += String.fromCharCode(b));
  return btoa(binary).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/g, "");
}

function rejectionKey(filename) {
  return `reject_${selectionKey(filename)}`;
}
''','rejection key')
between('function storageKeyRejected() {','function detectOrientation(width, height) {','''function storageKeyRejected() { return `raf-rejected-${slug}`; }
function loadRejectedState() {
  rejected = new Set();
  try { localStorage.removeItem(storageKeyRejected()); } catch (_) {}
}
function saveRejectedState() {}
''','local rejection')
one('''  Object.values(raw || {}).forEach(item => {
    if (!item?.filename) return;
''','''  Object.values(raw || {}).forEach(item => {
    if (!item?.filename || item?.type === "rejected") return;
''','favorites parser')
one('''  return new Map(items.map(item => [item.filename, item]));
}

async function loadFavorites() {''','''  return new Map(items.map(item => [item.filename, item]));
}

function normalizedSharedRejected(raw) {
  const exact = new Map(photos.map(p => [String(p.filename), p.filename]));
  const base = new Map(photos.map(p => [displayName(p.filename).toLowerCase(), p.filename]));
  const result = new Set();
  Object.values(raw || {}).forEach(item => {
    if (!item?.filename || item?.type !== "rejected") return;
    const name = exact.get(String(item.filename)) || base.get(displayName(item.filename).toLowerCase());
    if (name) result.add(name);
  });
  return result;
}

function applySharedSelectionState(raw) {
  favorites = normalizedSharedFavorites(raw);
  rejected = normalizedSharedRejected(raw);
}

async function loadFavorites() {''','rejected parser')
between('async function loadFavorites() {','async function loadLatestApproval() {','''async function loadFavorites() {
  try {
    const snap = await get(ref(db, `selections/${slug}`));
    applySharedSelectionState(snap.exists() ? snap.val() : {});
  } catch (error) {
    console.error("LOAD SELECTION STATE ERROR", error);
  }
}
''','load shared')
between('async function clearAllFavorites() {','async function approveCurrentSelection() {','''async function clearAllFavorites() {
  if (!favorites.size) { toast("Nie ma serduszek do wyczyszczenia."); return; }
  if (!confirm(`Wyczyścić wszystkie ${favorites.size} wybrane zdjęcia i zacząć wybór od nowa?`)) return;
  const button = $("#clearFavoritesBtn");
  if (button) button.disabled = true;
  try {
    const branchRef = ref(db, `selections/${slug}`);
    const snap = await get(branchRef);
    const keep = {};
    Object.entries(snap.exists() ? snap.val() : {}).forEach(([key,item]) => { if(item?.type === "rejected") keep[key]=item; });
    await set(branchRef, Object.keys(keep).length ? keep : null);
    favorites.clear(); render(); updateUI(); toast("Wyczyszczono wszystkie serduszka");
  } catch(error) { console.error("CLEAR FAVORITES ERROR",error); toast(`Nie udało się wyczyścić: ${error.code || error.message || error}`); }
  finally { if(button) button.disabled=false; }
}
''','clear favorites')
between('function watchFavorites() {','function heroRequiredCount(layout) {','''function watchFavorites() {
  if (unsubscribeFavorites) unsubscribeFavorites();
  unsubscribeFavorites = onValue(ref(db, `selections/${slug}`), snapshot => {
    applySharedSelectionState(snapshot.exists() ? snapshot.val() : {});
    if (galleryLoaded) { render(); updateUI(); }
  }, error => console.error("SELECTION STATE WATCH ERROR", error));
}
''','watch state')
s=s.replace('"Nie ukryto żadnych zdjęć."','"Nie odrzucono żadnych zdjęć."')
s=s.replace('rejectBtn.title = isRejected ? "Przywróć zdjęcie" : "Ukryj / odrzuć zdjęcie";','rejectBtn.title = isRejected ? "Cofnij odrzucenie" : "Odrzuć zdjęcie — nie używać";')
between('async function toggleFavorite(filename) {','function toggleRejected(filename) {','''async function toggleFavorite(filename) {
  if (currentUiConfig.showHeartButton === false) return;
  const wasSelected = favorites.has(filename);
  const wasRejected = rejected.has(filename);
  if (!wasSelected && maxFavorites() > 0 && favorites.size >= maxFavorites()) { toast(`Możesz wybrać maksymalnie ${maxFavorites()} zdjęć.`); return; }
  const value = { filename, selectedAt: Date.now() };
  if (wasSelected) favorites.delete(filename); else { favorites.set(filename,value); if(wasRejected) rejected.delete(filename); }
  render();
  try {
    const favRef=ref(db,`selections/${slug}/${selectionKey(filename)}`);
    const rejRef=ref(db,`selections/${slug}/${rejectionKey(filename)}`);
    if(wasSelected) await remove(favRef); else { if(wasRejected) await remove(rejRef); await set(favRef,value); }
    toast(wasSelected ? "Usunięto z wybranych" : wasRejected ? "Przywrócono i dodano do wybranych" : "Dodano do wybranych");
  } catch(error) {
    if(wasSelected) favorites.set(filename,value); else favorites.delete(filename);
    if(wasRejected) rejected.add(filename);
    render(); console.error("FAVORITE WRITE ERROR",error); toast(`Błąd zapisu wyboru: ${error.code || error.message || error}`);
  }
}
''','toggle favorite')
between('function toggleRejected(filename) {','function toggleCompareSelection(filename) {','''async function toggleRejected(filename) {
  if (currentUiConfig.showRejectButton === false) return;
  const wasRejected=rejected.has(filename);
  const oldFavorite=favorites.get(filename)||null;
  if(wasRejected) rejected.delete(filename); else { rejected.add(filename); favorites.delete(filename); downloadSelection.delete(filename); compareSelection=compareSelection.filter(n=>n!==filename); }
  render();
  const rejRef=ref(db,`selections/${slug}/${rejectionKey(filename)}`);
  const favRef=ref(db,`selections/${slug}/${selectionKey(filename)}`);
  try {
    if(wasRejected) { await remove(rejRef); toast("Cofnięto odrzucenie zdjęcia"); }
    else { await set(rejRef,{filename,selectedAt:Date.now(),type:"rejected"}); if(oldFavorite) await remove(favRef); toast("Zdjęcie odrzucone — fotograf nie będzie go używał"); }
  } catch(error) {
    if(wasRejected) rejected.add(filename); else rejected.delete(filename);
    if(oldFavorite) favorites.set(filename,oldFavorite);
    render(); console.error("REJECT PHOTO WRITE ERROR",error); toast(`Nie udało się zapisać odrzucenia: ${error.code || error.message || error}`);
  }
}
''','toggle rejected')
one('''    rejectBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleRejected(photo.filename);
    });''','''    rejectBtn.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await toggleRejected(photo.filename);
    });''','reject click')

assert 'function normalizedSharedRejected(raw)' in s
assert 'type:"rejected"' in s
p.write_text(s,encoding='utf-8')
print('app.js patched')
