from pathlib import Path

p=Path('admin.js')
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
one('    hidden: "Ukryte",','    hidden: "Odrzucone",','default label')
one('''function normalizedUiConfig(pub) {
  const stored = pub?.uiConfig || {};
  return {
    ...DEFAULT_UI_CONFIG,
    ...stored,
    labels: { ...DEFAULT_UI_CONFIG.labels, ...(stored.labels || {}) },''','''function normalizedUiConfig(pub) {
  const stored = pub?.uiConfig || {};
  const labels = { ...DEFAULT_UI_CONFIG.labels, ...(stored.labels || {}) };
  if (!stored.labels?.hidden || stored.labels.hidden === "Ukryte") labels.hidden = "Odrzucone";
  return {
    ...DEFAULT_UI_CONFIG,
    ...stored,
    labels,''','normalize label')
one('''  const consume = (item) => {
    if (!item?.filename) return;''','''  const consume = (item) => {
    if (!item?.filename || item?.type === "rejected") return;''','favorites ignore rejected')
one('''function selectionCountForSlug(slug) {
  return mergedSelectionForSlug(slug).length;
}''','''function rejectedItemsForSlug(slug) {
  const current = selectionsRoot?.[slug] || {};
  const pub = galleries[slug]?.public || {};
  const manifest = Object.values(pub.photos || {}).filter(x => x?.filename);
  const exact = new Map(manifest.map(x => [String(x.filename),x.filename]));
  const base = new Map(manifest.map(x => [displayName(x.filename).toLowerCase(),x.filename]));
  const result = new Map();
  Object.values(current).forEach(item => {
    if(!item?.filename || item?.type !== "rejected") return;
    const name=exact.get(String(item.filename)) || base.get(displayName(item.filename).toLowerCase());
    if(name) result.set(name,{...item,filename:name});
  });
  return [...result.values()].sort((a,b)=>displayName(a.filename).localeCompare(displayName(b.filename),undefined,{numeric:true}));
}

function remainingItemsForSlug(slug) {
  const rejectedSet=new Set(rejectedItemsForSlug(slug).map(x=>x.filename));
  const pub=galleries[slug]?.public || {};
  return Object.values(pub.photos || {}).filter(x=>x?.filename && x?.hiddenFromClient !== true && !rejectedSet.has(x.filename)).map(x=>({filename:x.filename,previewUrl:x.previewUrl,originalPath:x.originalPath})).sort((a,b)=>displayName(a.filename).localeCompare(displayName(b.filename),undefined,{numeric:true}));
}

function selectionCountForSlug(slug) {
  return mergedSelectionForSlug(slug).length;
}''','rejection helpers')
between('async function migrateLegacyFavoritesToShared(slug) {','async function downloadAdminSelected(slug, items, button) {','''async function migrateLegacyFavoritesToShared(slug) {
  const items = mergedSelectionForSlug(slug);
  const cleanSelection = {};
  Object.entries(selectionsRoot?.[slug] || {}).forEach(([key,item]) => { if(item?.type === "rejected" && item?.filename) cleanSelection[key]=item; });
  items.forEach(item => { cleanSelection[manifestKey(item.filename)]={filename:item.filename,selectedAt:Number(item.selectedAt || Date.now())}; });
  try {
    await set(ref(db, `selections/${slug}`), Object.keys(cleanSelection).length ? cleanSelection : null);
    await remove(ref(db, `favorites/${slug}`)).catch(()=>{});
    await update(ref(db, `galleries/${slug}/public`), {selectionMigrationVersion:6,updatedAt:Date.now()});
  } catch(error) { console.warn("SELECTION MIGRATION ERROR",error); }
  return items;
}
''','migration preserve rejected')
one('''    const selectedCount = selectionCountForSlug(slug);
    const photoCount = Object.keys(pub.photos || {}).length || Number(pub.photoCount || 0);''','''    const selectedCount = selectionCountForSlug(slug);
    const rejectedCount = rejectedItemsForSlug(slug).length;
    const photoCount = Object.keys(pub.photos || {}).length || Number(pub.photoCount || 0);''','card rejected count var')
one('''          <span>♥ ${selectedCount} wybranych zdjęć</span>
          <span>${pub.maxFavorites ? `limit ${pub.maxFavorites}` : "bez limitu"}</span>''','''          <span>♥ ${selectedCount} wybranych zdjęć</span>
          <span>× ${rejectedCount} odrzuconych</span>
          <span>${pub.maxFavorites ? `limit ${pub.maxFavorites}` : "bez limitu"}</span>''','card rejected count ui')
between('async function openSelections(slug) {','$("#closeSelectionDialog").addEventListener','''function selectionPhotoData(item,gallery){
  const list=Object.values({...(gallery.public?.photos || {}),...(gallery.privatePhotos || {})});
  const m=list.find(x=>x?.filename===item.filename) || list.find(x=>displayName(x?.filename).toLowerCase()===displayName(item.filename).toLowerCase());
  return {filename:item.filename,previewUrl:m?.previewUrl || item.previewUrl || ""};
}
async function copyFilenameList(items,label){
  const text=items.map(x=>displayName(x.filename)).join("\\n");
  if(!text){ toast(`Brak zdjęć: ${label}`); return; }
  await navigator.clipboard.writeText(text); toast(`Skopiowano ${items.length} nazw — ${label}`);
}
async function openSelections(slug) {
  const gallery=galleries[slug] || {};
  const container=$("#selectionContent");
  $("#selectionTitle").textContent=`${gallery.public?.title || slug} — wybór, odrzucenia i zatwierdzenia`;
  container.innerHTML='<div class="loading">Ładowanie wyborów…</div>';
  $("#selectionDialog").showModal();
  const items=await migrateLegacyFavoritesToShared(slug);
  const rejectedItems=rejectedItemsForSlug(slug);
  const remainingItems=remainingItemsForSlug(slug);
  const approvals=approvalRowsForSlug(slug);
  container.innerHTML="";
  const style=document.createElement("style");
  style.textContent='.reject-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:0 0 16px}.reject-summary article{border:1px solid #2b2b30;background:#111114;border-radius:14px;padding:14px}.reject-summary small{display:block;color:#888;margin-bottom:4px}.reject-summary strong{font-size:24px}.rejection-block,.remaining-block{margin-top:16px;border:1px solid #2b2b30;border-radius:16px;padding:15px;background:#101012}.rejection-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px}.rejection-actions{display:flex;gap:8px;flex-wrap:wrap}.rejection-list{display:flex;flex-wrap:wrap;gap:7px}.rejection-list span{padding:7px 9px;border-radius:9px;background:#1b1b1f;border:1px solid #34343a;font-weight:700}.rejection-warning{color:#ff9ea6;font-size:12px;margin-top:8px}@media(max-width:700px){.reject-summary{grid-template-columns:1fr}.rejection-actions>*{flex:1 1 100%}}';
  container.appendChild(style);
  const summary=document.createElement("section"); summary.className="reject-summary";
  summary.innerHTML=`<article><small>♥ Wybrane do obróbki</small><strong>${items.length}</strong></article><article><small>× Odrzucone — nie używać</small><strong>${rejectedItems.length}</strong></article><article><small>✓ Nieodrzucone</small><strong>${remainingItems.length}</strong></article>`; container.appendChild(summary);
  const approval=document.createElement("section"); approval.className="approval-history";
  approval.innerHTML=!approvals.length?'<div class="notice">Klient nie zatwierdził jeszcze ostatecznego wyboru do obróbki.</div>':`<div class="approval-history-head"><div><p class="eyebrow">LOG ZATWIERDZEŃ</p><h3>Historia zatwierdzonych wyborów</h3></div><strong>${approvals.length} ${approvals.length===1?"zatwierdzenie":"zatwierdzeń"}</strong></div><div class="approval-history-list">${approvals.map((row,index)=>`<article class="approval-log-row${index===0?" latest":""}"><div><b>${index===0?"NAJNOWSZE • ":""}${Number(row.selectedCount || 0)} zdjęć</b><span>${escapeHtml(formatDateTimePl(row.submittedAt))}</span></div><details><summary>Pokaż zapisane nazwy (${Object.keys(row.filenames || {}).length})</summary><div class="approval-filenames">${Object.values(row.filenames || {}).map(x=>`<span>${escapeHtml(displayName(x?.filename))}</span>`).join("")}</div></details></article>`).join("")}</div>`; container.appendChild(approval);
  if(items.length){
    const block=document.createElement("section"); block.className="selection-client selection-single"; block.innerHTML=`<div class="selection-single-head"><div><h3>♥ Aktualnie wybrane zdjęcia klienta</h3><div class="gallery-meta"><span>${items.length} zdjęć</span></div></div><button type="button" class="primary download-all">♥ Pobierz wybrane (${items.length})</button></div><div class="selection-photo-grid"></div>`;
    const grid=block.querySelector('.selection-photo-grid');
    for(const item of items){ const d=selectionPhotoData(item,gallery); const card=document.createElement('article'); card.className='selection-photo-card'; card.innerHTML=`<div class="selection-photo-thumb" ${d.previewUrl?`style="background-image:url('${d.previewUrl}')"`:""}></div><div class="selection-photo-info"><strong>${escapeHtml(displayName(d.filename))}</strong><button type="button" class="ghost download-one">↓ Pobierz</button></div>`; card.querySelector('.download-one').addEventListener('click',async()=>{const url=await getAdminPhotoDownloadUrl(slug,d.filename); if(url) startAdminAttachmentDownload(url,d.filename); else toast(`Nie znaleziono pliku ${displayName(d.filename)}`);}); grid.appendChild(card); }
    block.querySelector('.download-all').addEventListener('click',e=>downloadAdminSelected(slug,items,e.currentTarget)); container.appendChild(block);
  } else container.insertAdjacentHTML('beforeend','<div class="notice">Aktualnie klient nie ma żadnych serduszek.</div>');
  const rejectedBlock=document.createElement('section'); rejectedBlock.className='rejection-block'; rejectedBlock.innerHTML=`<div class="rejection-head"><div><p class="eyebrow">ODRZUCONE</p><h3>× Zdjęcia, których klient nie chce używać</h3></div><div class="rejection-actions"><button type="button" class="ghost copy-rejected">Kopiuj listę odrzuconych</button></div></div>${rejectedItems.length?`<div class="rejection-list">${rejectedItems.map(x=>`<span>${escapeHtml(displayName(x.filename))}</span>`).join("")}</div>`:'<div class="notice">Klient nie odrzucił żadnego zdjęcia.</div>'}<div class="rejection-warning">Odrzucone zdjęcia nie są wliczane do listy „nieodrzuconych”.</div>`; rejectedBlock.querySelector('.copy-rejected').addEventListener('click',()=>copyFilenameList(rejectedItems,'odrzucone')); container.appendChild(rejectedBlock);
  const remainingBlock=document.createElement('section'); remainingBlock.className='remaining-block'; remainingBlock.innerHTML=`<div class="rejection-head"><div><p class="eyebrow">POZOSTAWIONE</p><h3>✓ Wszystkie zdjęcia, których klient NIE odrzucił</h3></div><div class="rejection-actions"><button type="button" class="ghost copy-remaining">Kopiuj listę pozostawionych</button><button type="button" class="primary download-remaining">↓ Pobierz wszystkie nieodrzucone (${remainingItems.length})</button></div></div><div class="rejection-list">${remainingItems.map(x=>`<span>${escapeHtml(displayName(x.filename))}</span>`).join("")}</div>`; remainingBlock.querySelector('.copy-remaining').addEventListener('click',()=>copyFilenameList(remainingItems,'nieodrzucone')); remainingBlock.querySelector('.download-remaining').addEventListener('click',e=>downloadAdminSelected(slug,remainingItems,e.currentTarget)); container.appendChild(remainingBlock);
}
''','enhanced selections')

assert 'function rejectedItemsForSlug(slug)' in s
assert 'Pobierz wszystkie nieodrzucone' in s
p.write_text(s,encoding='utf-8')
print('admin.js patched')
