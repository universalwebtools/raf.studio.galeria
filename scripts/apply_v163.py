from pathlib import Path
import re

ROOT = Path('.')


def replace_js_function(text: str, name: str, replacement: str) -> str:
    m = re.search(rf'(?m)^(?:async\s+)?function\s+{re.escape(name)}\s*\(', text)
    if not m:
        raise RuntimeError(f'Function not found: {name}')
    brace = text.find('{', m.end())
    if brace < 0:
        raise RuntimeError(f'Opening brace not found: {name}')

    i = brace
    depth = 0
    quote = None
    escape = False
    line_comment = False
    block_comment = False
    while i < len(text):
        ch = text[i]
        nxt = text[i+1] if i + 1 < len(text) else ''

        if line_comment:
            if ch == '\n':
                line_comment = False
            i += 1
            continue
        if block_comment:
            if ch == '*' and nxt == '/':
                block_comment = False
                i += 2
                continue
            i += 1
            continue
        if quote:
            if escape:
                escape = False
            elif ch == '\\':
                escape = True
            elif ch == quote:
                quote = None
            i += 1
            continue

        if ch == '/' and nxt == '/':
            line_comment = True
            i += 2
            continue
        if ch == '/' and nxt == '*':
            block_comment = True
            i += 2
            continue
        if ch in ('\"', "'", '`'):
            quote = ch
            i += 1
            continue
        if ch == '{':
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0:
                end = i + 1
                return text[:m.start()] + replacement.rstrip() + text[end:]
        i += 1
    raise RuntimeError(f'Closing brace not found: {name}')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise RuntimeError(f'Missing marker: {label}')
    return text.replace(old, new, 1)


app_path = ROOT / 'app.js'
app = app_path.read_text(encoding='utf-8')
app = app.replace('hidden: "Ukryte"', 'hidden: "Odrzucone"')
app = app.replace('rejectBtn.title = isRejected ? "Przywróć zdjęcie" : "Ukryj / odrzuć zdjęcie";',
                  'rejectBtn.title = isRejected ? "Przywróć zdjęcie" : "Odrzuć zdjęcie — nie używać";')
app = replace_once(app,
    '  Object.values(raw || {}).forEach(item => {\n    if (!item?.filename) return;',
    '  Object.values(raw || {}).forEach(item => {\n    if (!item?.filename || item?.rejected === true) return;',
    'client favorites reject filter')

new_load_favorites = r'''async function loadFavorites() {
  try {
    const legacyRejected = new Set(rejected);
    const snap = await get(ref(db, `selections/${slug}`));
    const raw = snap.exists() ? snap.val() : {};
    favorites = normalizedSharedFavorites(raw);
    rejected = normalizedSharedRejected(raw);

    const legacyToMigrate = [...legacyRejected].filter(filename =>
      photos.some(photo => photo.filename === filename) &&
      !favorites.has(filename) &&
      !rejected.has(filename)
    );

    if (legacyToMigrate.length) {
      const now = Date.now();
      await Promise.all(legacyToMigrate.map((filename, index) =>
        set(ref(db, `selections/${slug}/${selectionKey(filename)}`), {
          filename,
          selectedAt: now + index,
          rejected: true
        })
      ));
      legacyToMigrate.forEach(filename => rejected.add(filename));
    }
    saveRejectedState();
  } catch (error) {
    console.error("LOAD FAVORITES ERROR", error);
  }
}'''
app = replace_js_function(app, 'loadFavorites', new_load_favorites)

new_clear = r'''async function clearAllFavorites() {
  if (!favorites.size) {
    toast("Nie ma serduszek do wyczyszczenia.");
    return;
  }
  if (!confirm(`Wyczyścić wszystkie ${favorites.size} wybrane zdjęcia i zacząć wybór od nowa?\n\nOdrzucone zdjęcia pozostaną odrzucone.`)) return;
  const button = $("#clearFavoritesBtn");
  if (button) button.disabled = true;
  try {
    const filenames = [...favorites.keys()];
    await Promise.all(filenames.map(filename =>
      remove(ref(db, `selections/${slug}/${selectionKey(filename)}`))
    ));
    favorites.clear();
    toast("Wyczyszczono wszystkie serduszka");
    render();
    updateUI();
  } catch (error) {
    console.error("CLEAR FAVORITES ERROR", error);
    toast(`Nie udało się wyczyścić: ${error.code || error.message || error}`);
  } finally {
    if (button) button.disabled = false;
  }
}'''
app = replace_js_function(app, 'clearAllFavorites', new_clear)

new_watch = r'''function watchFavorites() {
  if (unsubscribeFavorites) unsubscribeFavorites();
  unsubscribeFavorites = onValue(
    ref(db, `selections/${slug}`),
    (snapshot) => {
      const raw = snapshot.exists() ? snapshot.val() : {};
      favorites = normalizedSharedFavorites(raw);
      rejected = normalizedSharedRejected(raw);
      saveRejectedState();
      if (galleryLoaded) {
        render();
        updateUI();
      }
    },
    (error) => console.error("FAVORITES WATCH ERROR", error)
  );
}'''
app = replace_js_function(app, 'watchFavorites', new_watch)

new_toggle_favorite = r'''async function toggleFavorite(filename) {
  if (currentUiConfig.showHeartButton === false) return;
  const wasSelected = favorites.has(filename);
  const wasRejected = rejected.has(filename);

  if (!wasSelected && maxFavorites() > 0 && favorites.size >= maxFavorites()) {
    toast(`Możesz wybrać maksymalnie ${maxFavorites()} zdjęć.`);
    return;
  }
  const optimisticValue = { filename, selectedAt: Date.now() };
  if (wasSelected) favorites.delete(filename);
  else {
    favorites.set(filename, optimisticValue);
    rejected.delete(filename);
  }
  saveRejectedState();
  render();
  updateUI();

  try {
    const target = ref(db, `selections/${slug}/${selectionKey(filename)}`);
    if (wasSelected) await remove(target);
    else await set(target, optimisticValue);
    toast(wasSelected ? "Usunięto z wybranych" : "Dodano do wybranych");
  } catch (error) {
    console.error("FAVORITE WRITE ERROR", error);
    if (wasSelected) favorites.set(filename, optimisticValue);
    else favorites.delete(filename);
    if (wasRejected) rejected.add(filename);
    saveRejectedState();
    render();
    updateUI();
    toast(`Nie udało się zapisać wyboru: ${error.code || error.message || error}`);
  }
}'''
app = replace_js_function(app, 'toggleFavorite', new_toggle_favorite)

new_toggle_rejected = r'''async function toggleRejected(filename) {
  if (currentUiConfig.showRejectButton === false) return;
  const wasRejected = rejected.has(filename);
  const previousFavorite = favorites.get(filename) || null;

  if (wasRejected) rejected.delete(filename);
  else {
    rejected.add(filename);
    favorites.delete(filename);
    downloadSelection.delete(filename);
    compareSelection = compareSelection.filter(name => name !== filename);
  }
  saveRejectedState();
  render();
  updateUI();

  try {
    const target = ref(db, `selections/${slug}/${selectionKey(filename)}`);
    if (wasRejected) {
      await remove(target);
      toast("Przywrócono zdjęcie");
    } else {
      await set(target, { filename, selectedAt: Date.now(), rejected: true });
      toast("Odrzucono zdjęcie — nie będzie na liście do wykorzystania");
    }
  } catch (error) {
    console.error("REJECT WRITE ERROR", error);
    if (wasRejected) rejected.add(filename);
    else rejected.delete(filename);
    if (previousFavorite) favorites.set(filename, previousFavorite);
    saveRejectedState();
    render();
    updateUI();
    toast(`Nie udało się zapisać odrzucenia: ${error.code || error.message || error}`);
  }
}'''
app = replace_js_function(app, 'toggleRejected', new_toggle_rejected)

helper = r'''
function normalizedSharedRejected(raw) {
  const currentByExact = new Map(photos.map(photo => [String(photo.filename), photo.filename]));
  const currentByBase = new Map(photos.map(photo => [displayName(photo.filename).toLowerCase(), photo.filename]));
  const result = new Set();
  Object.values(raw || {}).forEach(item => {
    if (!item?.filename || item?.rejected !== true) return;
    const canonical = currentByExact.get(String(item.filename)) ||
      currentByBase.get(displayName(item.filename).toLowerCase());
    if (canonical) result.add(canonical);
  });
  return result;
}

'''
if helper.strip() not in app:
    app = replace_once(app, 'async function loadFavorites() {', helper + 'async function loadFavorites() {', 'rejected normalization insert')
app_path.write_text(app, encoding='utf-8')

admin_path = ROOT / 'admin.js'
admin = admin_path.read_text(encoding='utf-8')
admin = admin.replace('hidden: "Ukryte"', 'hidden: "Odrzucone"')


def extract_func(text, name):
    m = re.search(rf'(?m)^(?:async\s+)?function\s+{re.escape(name)}\s*\(', text)
    if not m: raise RuntimeError(name)
    brace = text.find('{', m.end())
    i=brace; depth=0; quote=None; esc=False; lc=False; bc=False
    while i < len(text):
        ch=text[i]; nxt=text[i+1] if i+1<len(text) else ''
        if lc:
            if ch=='\n': lc=False
            i+=1; continue
        if bc:
            if ch=='*' and nxt=='/': bc=False; i+=2; continue
            i+=1; continue
        if quote:
            if esc: esc=False
            elif ch=='\\': esc=True
            elif ch==quote: quote=None
            i+=1; continue
        if ch=='/' and nxt=='/': lc=True; i+=2; continue
        if ch=='/' and nxt=='*': bc=True; i+=2; continue
        if ch in ('\"',"'",'`'): quote=ch; i+=1; continue
        if ch=='{': depth+=1
        elif ch=='}':
            depth-=1
            if depth==0: return m.start(), i+1, text[m.start():i+1]
        i+=1
    raise RuntimeError('no end '+name)

s,e,merged_func = extract_func(admin, 'mergedSelectionForSlug')
merged_func2 = merged_func.replace('if (!item?.filename) return;', 'if (!item?.filename || item?.rejected === true) return;', 1)
if merged_func2 == merged_func: raise RuntimeError('could not patch mergedSelectionForSlug consume')
admin = admin[:s] + merged_func2 + admin[e:]

s,e,migrate_func = extract_func(admin, 'migrateLegacyFavoritesToShared')
preserve = r'''
  Object.entries(selectionsRoot?.[slug] || {}).forEach(([key, item]) => {
    if (item?.filename && item?.rejected === true) {
      cleanSelection[key] = {
        filename: item.filename,
        selectedAt: Number(item.selectedAt || Date.now()),
        rejected: true
      };
    }
  });
'''
if preserve.strip() not in migrate_func:
    marker = '\n  try {'
    if marker not in migrate_func: raise RuntimeError('migration try marker missing')
    migrate_func = migrate_func.replace(marker, '\n' + preserve + marker, 1)
admin = admin[:s] + migrate_func + admin[e:]

admin_extra = r'''

// ===== v16.3.0: shared rejected-photo workflow =====
function rejectedItemsForSlug(slug) {
  const raw = selectionsRoot?.[slug] || {};
  const manifest = Object.values(galleries[slug]?.public?.photos || {}).filter(item => item?.filename);
  const byExact = new Map(manifest.map(item => [String(item.filename), item]));
  const byBase = new Map(manifest.map(item => [displayName(item.filename).toLowerCase(), item]));
  const result = new Map();
  Object.values(raw).forEach(item => {
    if (!item?.filename || item?.rejected !== true) return;
    const manifestItem = byExact.get(String(item.filename)) || byBase.get(displayName(item.filename).toLowerCase());
    if (!manifestItem) return;
    result.set(manifestItem.filename, { ...manifestItem, ...item, filename: manifestItem.filename });
  });
  return [...result.values()].sort((a,b) => displayName(a.filename).localeCompare(displayName(b.filename), undefined, { numeric:true }));
}

function remainingItemsForSlug(slug) {
  const rejectedNames = new Set(rejectedItemsForSlug(slug).map(item => item.filename));
  return Object.values(galleries[slug]?.public?.photos || {})
    .filter(item => item?.filename && !rejectedNames.has(item.filename))
    .sort((a,b) => displayName(a.filename).localeCompare(displayName(b.filename), undefined, { numeric:true }));
}

async function copyV163FilenameList(items, label) {
  const text = items.map(item => displayName(item.filename)).join("\n");
  if (!text) { toast(`Brak zdjęć na liście: ${label}.`); return; }
  await navigator.clipboard.writeText(text);
  toast(`Skopiowano ${items.length} nazw — ${label}`);
}

function renderRejectedAdminTools(slug) {
  const container = $("#selectionContent");
  if (!container) return;
  container.querySelector(".v163-rejection-tools")?.remove();
  const rejectedItems = rejectedItemsForSlug(slug);
  const remainingItems = remainingItemsForSlug(slug);
  const section = document.createElement("section");
  section.className = "selection-client selection-single v163-rejection-tools";
  section.innerHTML = `
    <div class="selection-single-head">
      <div><p class="eyebrow">ODRZUCONE ZDJĘCIA</p><h3>× Odrzucone przez klienta</h3><div class="gallery-meta"><span>${rejectedItems.length} zdjęć — klient nie chce, aby były wykorzystywane</span></div></div>
      <button type="button" class="ghost copy-rejected">Kopiuj listę odrzuconych</button>
    </div>
    <div class="approval-filenames rejected-filenames">${rejectedItems.length ? rejectedItems.map(item => `<span>${escapeHtml(displayName(item.filename))}</span>`).join("") : '<span>Brak odrzuconych zdjęć.</span>'}</div>
    <div class="selection-single-head" style="margin-top:18px">
      <div><p class="eyebrow">POZOSTAWIONE</p><h3>✓ Wszystkie nieodrzucone zdjęcia</h3><div class="gallery-meta"><span>${remainingItems.length} zdjęć pozostawionych przez klienta</span></div></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end"><button type="button" class="ghost copy-remaining">Kopiuj listę pozostawionych</button><button type="button" class="primary download-remaining">↓ Pobierz nieodrzucone (${remainingItems.length})</button></div>
    </div>
    <div class="approval-filenames remaining-filenames">${remainingItems.length ? remainingItems.map(item => `<span>${escapeHtml(displayName(item.filename))}</span>`).join("") : '<span>Brak nieodrzuconych zdjęć.</span>'}</div>`;
  section.querySelector(".copy-rejected")?.addEventListener("click", () => copyV163FilenameList(rejectedItems, "odrzucone"));
  section.querySelector(".copy-remaining")?.addEventListener("click", () => copyV163FilenameList(remainingItems, "pozostawione"));
  section.querySelector(".download-remaining")?.addEventListener("click", event => downloadAdminSelected(slug, remainingItems, event.currentTarget));
  container.appendChild(section);
}

const openSelectionsV1625 = openSelections;
openSelections = async function(slug) {
  await openSelectionsV1625(slug);
  renderRejectedAdminTools(slug);
};
'''
if 'v16.3.0: shared rejected-photo workflow' not in admin: admin += admin_extra
admin_path.write_text(admin, encoding='utf-8')

index_path = ROOT / 'index.html'
index = index_path.read_text(encoding='utf-8')
index = re.sub(r'app\.js\?v=[^\"\']+', 'app.js?v=16.3.0', index)
index = index.replace('id="hiddenFilter" class="seg">Ukryte</button>', 'id="hiddenFilter" class="seg">Odrzucone</button>')
index_path.write_text(index, encoding='utf-8')

admin_html_path = ROOT / 'admin.html'
admin_html = admin_html_path.read_text(encoding='utf-8')
admin_html = re.sub(r'admin\.js\?v=[^\"\']+', 'admin.js?v=16.3.0', admin_html)
admin_html = admin_html.replace('× Ukryj zdjęcie', '× Odrzuć zdjęcie')
admin_html = admin_html.replace('>Ukryte\n', '>Odrzucone\n')
admin_html_path.write_text(admin_html, encoding='utf-8')

print('v16.3.0 patch applied')
