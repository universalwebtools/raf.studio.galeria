from pathlib import Path
import re


def read(path):
    return Path(path).read_text(encoding="utf-8")


def write(path, text):
    Path(path).write_text(text, encoding="utf-8")


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly 1 match, got {count}")
    return text.replace(old, new, 1)


def sub_once(text, pattern, replacement, label, flags=re.S):
    new_text, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly 1 regex match, got {count}")
    return new_text


# ---------------- index.html ----------------
index = read("index.html")
index = index.replace("style.css?v=16.3.0", "style.css?v=16.3.1")
index = index.replace("app.js?v=16.3.0", "app.js?v=16.3.1")

index = replace_once(
    index,
    '    <div class="selection-count">Wybrano <strong id="selectedCount">0</strong><span id="maxFavoritesLabel"></span></div>\n',
    '    <div class="selection-count">Wybrano <strong id="selectedCount">0</strong><span id="maxFavoritesLabel"></span></div>\n'
    '    <div id="rejectedCountSummary" class="rejected-count-summary" hidden>Odrzucono <strong id="rejectedCountTop">0</strong></div>\n',
    "index rejected counter"
)

selection_workflow = '''  <div id="selectionWorkflow" class="selection-workflow" hidden>
    <div class="selection-workflow-info">
      <strong>Twój wybór do obróbki</strong>
      <small id="selectionApprovalStatus">Możesz w każdej chwili wyczyścić serduszka i zacząć od nowa.</small>
    </div>
    <div class="selection-workflow-actions">
      <button id="clearFavoritesBtn" type="button" class="ghost danger-soft">♡ Wyczyść serduszka</button>
      <button id="approveSelectionBtn" type="button" class="primary">✓ Zatwierdź swoje wybory do obróbki</button>
    </div>
  </div>
'''
rejection_workflow = selection_workflow + '''
  <div id="rejectionWorkflow" class="selection-workflow rejection-workflow" hidden>
    <div class="selection-workflow-info rejection-workflow-info">
      <strong>Zdjęcia do odrzucenia: <span id="rejectedWorkflowCount">0</span></strong>
      <small id="rejectionApprovalStatus">Zaznacz zdjęcia, których fotograf nie powinien wykorzystywać.</small>
      <div id="rejectedFilenameList" class="rejected-client-list" hidden></div>
    </div>
    <div class="selection-workflow-actions rejection-workflow-actions">
      <button id="clearRejectedBtn" type="button" class="ghost danger-soft">× Wyczyść odrzucone</button>
      <button id="approveRejectedBtn" type="button" class="primary">✓ Zatwierdź zdjęcia do odrzucenia</button>
    </div>
  </div>
'''
index = replace_once(index, selection_workflow, rejection_workflow, "index rejection workflow")
write("index.html", index)


# ---------------- app.js ----------------
app = read("app.js")
app = replace_once(app, "let latestApproval = null;", "let latestApproval = null;\nlet latestRejectionApproval = null;", "app rejection approval state")

app = sub_once(
    app,
    r'function filteredPhotos\(\) \{.*?\n\}\n\nfunction visiblePhotos\(\)',
    '''function filteredPhotos() {
  switch (filter) {
    case "favorites":
      return photos.filter(photo => favorites.has(photo.filename) && !rejected.has(photo.filename));
    case "portrait":
      return photos.filter(photo => photo.orientation === "portrait");
    case "landscape":
      return photos.filter(photo => photo.orientation === "landscape");
    case "hidden":
      return photos.filter(photo => rejected.has(photo.filename));
    default:
      // Odrzucone zdjęcia zostają w głównym widoku — tylko są wyraźnie wyszarzone.
      return photos;
  }
}

function visiblePhotos()''',
    "app filteredPhotos"
)

app = replace_once(
    app,
    '''    loadFavorites()
      .then(() => {
        render();
        updateUI();
        watchFavorites();
      })''',
    '''    Promise.all([loadFavorites(), loadLatestApproval()])
      .then(() => {
        render();
        updateUI();
        watchFavorites();
      })''',
    "app load approvals with gallery"
)

app = sub_once(
    app,
    r'async function loadLatestApproval\(\) \{.*?\n\}\n\nfunction formatApprovalDate',
    '''async function loadLatestApproval() {
  try {
    const snap = await get(ref(db, `approvals/${slug}`));
    if (!snap.exists()) {
      latestApproval = null;
      latestRejectionApproval = null;
      updateApprovalStatus();
      updateRejectionApprovalStatus();
      return;
    }

    const rows = Object.values(snap.val() || {})
      .filter(row => row?.submittedAt)
      .sort((a,b) => Number(b.submittedAt) - Number(a.submittedAt));

    latestApproval = rows.find(row => row?.mode !== "rejected") || null;
    latestRejectionApproval = rows.find(row => row?.mode === "rejected") || null;
    updateApprovalStatus();
    updateRejectionApprovalStatus();
  } catch (error) {
    console.warn("LOAD APPROVAL ERROR", error);
  }
}

function formatApprovalDate''',
    "app loadLatestApproval"
)

approval_status_block = '''function updateApprovalStatus() {
  const status = $("#selectionApprovalStatus");
  if (!status) return;
  if (!latestApproval) {
    status.textContent = "Możesz w każdej chwili wyczyścić serduszka i zacząć od nowa.";
    return;
  }
  status.textContent = `Ostatnio zatwierdzono ${latestApproval.selectedCount || 0} zdjęć • ${formatApprovalDate(latestApproval.submittedAt)}. Jeśli zmienisz wybór, zatwierdź ponownie.`;
}
'''
new_status_block = approval_status_block + '''
function sortedRejectedNames() {
  return [...rejected]
    .filter(filename => photos.some(photo => photo.filename === filename))
    .sort((a, b) => displayName(a).localeCompare(displayName(b), undefined, { numeric: true }));
}

function renderRejectedWorkflowList() {
  const list = $("#rejectedFilenameList");
  if (!list) return;
  const names = sortedRejectedNames();
  list.innerHTML = names.map(filename => `<span>${displayName(filename)}</span>`).join("");
  list.hidden = names.length === 0;
}

function updateRejectionApprovalStatus() {
  const status = $("#rejectionApprovalStatus");
  if (!status) return;
  const count = rejected.size;
  if (!latestRejectionApproval) {
    status.textContent = count
      ? `Masz zaznaczone ${count} ${count === 1 ? "zdjęcie" : "zdjęć"} do odrzucenia. Możesz zmienić decyzję przed zatwierdzeniem.`
      : "Zaznacz zdjęcia, których fotograf nie powinien wykorzystywać.";
    return;
  }
  status.textContent = `Ostatnio zatwierdzono ${latestRejectionApproval.selectedCount || 0} zdjęć do odrzucenia • ${formatApprovalDate(latestRejectionApproval.submittedAt)}. Jeśli coś zmienisz, zatwierdź ponownie.`;
}

async function clearAllRejected() {
  if (!rejected.size) {
    toast("Nie ma odrzuconych zdjęć do wyczyszczenia.");
    return;
  }
  if (!confirm(`Przywrócić wszystkie ${rejected.size} odrzucone zdjęcia i zacząć od nowa?`)) return;

  const button = $("#clearRejectedBtn");
  if (button) button.disabled = true;
  try {
    const filenames = [...rejected];
    await Promise.all(filenames.map(filename =>
      remove(ref(db, `selections/${slug}/${selectionKey(filename)}`))
    ));
    rejected.clear();
    saveRejectedState();
    toast("Wyczyszczono wszystkie odrzucone zdjęcia");
    render();
    updateUI();
  } catch (error) {
    console.error("CLEAR REJECTED ERROR", error);
    toast(`Nie udało się wyczyścić odrzuceń: ${error.code || error.message || error}`);
  } finally {
    if (button) button.disabled = false;
  }
}

async function approveRejectedSelection() {
  if (!rejected.size) {
    toast("Najpierw odrzuć przynajmniej jedno zdjęcie.");
    return;
  }

  const names = sortedRejectedNames();
  const count = names.length;
  if (!confirm(`Zatwierdzić ${count} ${count === 1 ? "zdjęcie" : "zdjęć"} do odrzucenia?\\n\\nZapiszę datę, godzinę i pełną listę nazw zdjęć.`)) return;

  const button = $("#approveRejectedBtn");
  const old = button?.textContent || "✓ Zatwierdź zdjęcia do odrzucenia";
  if (button) { button.disabled = true; button.textContent = "Zapisywanie…"; }

  try {
    const filenames = {};
    names.forEach(filename => {
      filenames[selectionKey(filename)] = { filename };
    });
    const payload = {
      mode: "rejected",
      submittedAt: Date.now(),
      selectedCount: count,
      filenames
    };
    const target = push(ref(db, `approvals/${slug}`));
    await set(target, payload);
    latestRejectionApproval = payload;
    updateRejectionApprovalStatus();
    toast(`Zatwierdzono ${count} zdjęć do odrzucenia ✓`);
  } catch (error) {
    console.error("APPROVE REJECTED ERROR", error);
    toast(`Nie udało się zatwierdzić odrzuceń: ${error.code || error.message || error}`);
  } finally {
    if (button) { button.disabled = false; button.textContent = old; }
  }
}
'''
app = replace_once(app, approval_status_block, new_status_block, "app rejected workflow helpers")

app = replace_once(app, ': filter === "hidden" ? "Nie ukryto żadnych zdjęć."', ': filter === "hidden" ? "Nie odrzucono żadnych zdjęć."', "app empty rejected label")

app = sub_once(
    app,
    r'function updateUI\(\) \{.*?\n\}\n\n\nfunction toggleDownloadSelection',
    '''function updateUI() {
  const count = favorites.size;
  const rejectedCount = rejected.size;
  const heartsEnabled = currentUiConfig.showHeartButton !== false;
  const rejectEnabled = currentUiConfig.showRejectButton !== false;
  const rejectionOnlyMode = !heartsEnabled && rejectEnabled;

  $("#favCount").textContent = count;
  $("#selectedCount").textContent = count;

  const rejectedTop = $("#rejectedCountTop");
  const rejectedSummary = $("#rejectedCountSummary");
  if (rejectedTop) rejectedTop.textContent = rejectedCount;
  if (rejectedSummary) rejectedSummary.hidden = !rejectionOnlyMode;

  if (maxFavorites() > 0) {
    const percent = Math.min(100, (count / maxFavorites()) * 100);
    $("#selectProgress").style.width = `${percent}%`;
    $("#progressText").textContent = `Wybrano ${count} z ${maxFavorites()} zdjęć`;
  }

  const inlineHeartDownload = $("#downloadFavoritesInlineBtn");
  if (inlineHeartDownload) {
    inlineHeartDownload.hidden = !heartsEnabled || !canDownloadFavorites() || count === 0;
    inlineHeartDownload.textContent = `♥ ${currentUiConfig.labels.downloadFavorites || "Pobierz wybrane"} (${count})`;
  }
  const progressWrap = $("#progressWrap");
  if (progressWrap && !heartsEnabled) progressWrap.hidden = true;

  const workflow = $("#selectionWorkflow");
  if (workflow) workflow.hidden = !heartsEnabled;
  if ($("#clearFavoritesBtn")) $("#clearFavoritesBtn").disabled = count === 0;
  if ($("#approveSelectionBtn")) $("#approveSelectionBtn").disabled = count === 0;
  updateApprovalStatus();

  const rejectionWorkflow = $("#rejectionWorkflow");
  if (rejectionWorkflow) rejectionWorkflow.hidden = !rejectionOnlyMode;
  if ($("#rejectedWorkflowCount")) $("#rejectedWorkflowCount").textContent = rejectedCount;
  if ($("#clearRejectedBtn")) $("#clearRejectedBtn").disabled = rejectedCount === 0;
  if ($("#approveRejectedBtn")) $("#approveRejectedBtn").disabled = rejectedCount === 0;
  renderRejectedWorkflowList();
  updateRejectionApprovalStatus();

  updateDownloadUI();
  updateCompareUI();
  scheduleStickyWorkflowSync();
}


function toggleDownloadSelection''',
    "app updateUI"
)

app = replace_once(
    app,
    '''  $("#lightboxReject").classList.toggle("active", rejected.has(photo.filename));
  $("#lightboxReject").hidden = currentUiConfig.showRejectButton === false;''',
    '''  const isRejected = rejected.has(photo.filename);
  $("#lightboxReject").classList.toggle("active", isRejected);
  $("#lightboxReject").hidden = currentUiConfig.showRejectButton === false;
  $("#lightboxImage").classList.toggle("rejected-preview", isRejected);''',
    "app lightbox rejected preview"
)

app = replace_once(
    app,
    '$("#approveSelectionBtn")?.addEventListener("click", approveCurrentSelection);',
    '$("#approveSelectionBtn")?.addEventListener("click", approveCurrentSelection);\n$("#clearRejectedBtn")?.addEventListener("click", clearAllRejected);\n$("#approveRejectedBtn")?.addEventListener("click", approveRejectedSelection);',
    "app rejection listeners"
)

app = replace_once(
    app,
    "  const workflow = document.querySelector('.selection-workflow');",
    "  const workflow = document.querySelector('.selection-workflow:not([hidden])');",
    "app visible sticky workflow"
)

app = replace_once(
    app,
    '''  ['.client-topbar', '.client-controls', '.selection-workflow'].forEach(selector => {
    const element = document.querySelector(selector);
    if (element) stickyWorkflowObserver.observe(element);
  });''',
    '''  ['.client-topbar', '.client-controls'].forEach(selector => {
    const element = document.querySelector(selector);
    if (element) stickyWorkflowObserver.observe(element);
  });
  document.querySelectorAll('.selection-workflow').forEach(element => stickyWorkflowObserver.observe(element));''',
    "app sticky observer all workflows"
)

write("app.js", app)


# ---------------- admin.js ----------------
admin = read("admin.js")

admin = sub_once(
    admin,
    r'function approvalRowsForSlug\(slug\) \{.*?\n\}\n\nfunction latestApprovalForSlug\(slug\) \{.*?\n\}',
    '''function approvalRowsForSlug(slug) {
  return Object.entries(approvalsRoot?.[slug] || {})
    .map(([id,row]) => ({ id, ...(row || {}) }))
    .filter(row => row.submittedAt && row.mode !== "rejected")
    .sort((a,b) => Number(b.submittedAt) - Number(a.submittedAt));
}

function rejectionApprovalRowsForSlug(slug) {
  return Object.entries(approvalsRoot?.[slug] || {})
    .map(([id,row]) => ({ id, ...(row || {}) }))
    .filter(row => row.submittedAt && row.mode === "rejected")
    .sort((a,b) => Number(b.submittedAt) - Number(a.submittedAt));
}

function latestApprovalForSlug(slug) {
  return approvalRowsForSlug(slug)[0] || null;
}

function latestRejectionApprovalForSlug(slug) {
  return rejectionApprovalRowsForSlug(slug)[0] || null;
}''',
    "admin approval row split"
)

admin = replace_once(
    admin,
    '''          ${latestApprovalForSlug(slug) ? `<span class="approval-badge">✓ Zatwierdzono ${Number(latestApprovalForSlug(slug).selectedCount || 0)} • ${escapeHtml(formatDateTimePl(latestApprovalForSlug(slug).submittedAt))}</span>` : ""}''',
    '''          ${latestApprovalForSlug(slug) ? `<span class="approval-badge">✓ Zatwierdzono ${Number(latestApprovalForSlug(slug).selectedCount || 0)} • ${escapeHtml(formatDateTimePl(latestApprovalForSlug(slug).submittedAt))}</span>` : ""}
          ${latestRejectionApprovalForSlug(slug) ? `<span class="approval-badge reject-approval-badge">× Odrzucenia ${Number(latestRejectionApprovalForSlug(slug).selectedCount || 0)} • ${escapeHtml(formatDateTimePl(latestRejectionApprovalForSlug(slug).submittedAt))}</span>` : ""}''',
    "admin gallery rejection approval badge"
)

admin = sub_once(
    admin,
    r'function renderRejectedAdminTools\(slug\) \{.*?\n\}\n\nconst openSelectionsV1625',
    '''function renderRejectedAdminTools(slug) {
  const container = $("#selectionContent");
  if (!container) return;
  container.querySelector(".v163-rejection-tools")?.remove();

  const rejectedItems = rejectedItemsForSlug(slug);
  const remainingItems = remainingItemsForSlug(slug);
  const rejectionApprovals = rejectionApprovalRowsForSlug(slug);

  const section = document.createElement("section");
  section.className = "selection-client selection-single v163-rejection-tools";
  section.innerHTML = `
    <div class="selection-single-head">
      <div>
        <p class="eyebrow">ODRZUCONE ZDJĘCIA</p>
        <h3>× Odrzucone przez klienta</h3>
        <div class="gallery-meta"><span>${rejectedItems.length} zdjęć — klient nie chce, aby były wykorzystywane</span></div>
      </div>
      <button type="button" class="ghost copy-rejected">Kopiuj listę odrzuconych</button>
    </div>

    ${rejectionApprovals.length ? `
      <div class="rejection-approval-history">
        <p class="eyebrow">LOG ZATWIERDZEŃ ODRZUCEŃ</p>
        ${rejectionApprovals.map((row,index) => `
          <article class="approval-log-row${index === 0 ? " latest" : ""}">
            <div><b>${index === 0 ? "NAJNOWSZE • " : ""}${Number(row.selectedCount || 0)} zdjęć do odrzucenia</b><span>${escapeHtml(formatDateTimePl(row.submittedAt))}</span></div>
            <details>
              <summary>Pokaż zatwierdzoną listę (${Object.keys(row.filenames || {}).length})</summary>
              <div class="approval-filenames">${Object.values(row.filenames || {}).map(item => `<span>${escapeHtml(displayName(item?.filename))}</span>`).join("")}</div>
            </details>
          </article>`).join("")}
      </div>` : '<div class="notice">Klient nie zatwierdził jeszcze listy zdjęć do odrzucenia.</div>'}

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

const openSelectionsV1625''',
    "admin rejected tools with approval log"
)

write("admin.js", admin)


# ---------------- admin.html cache bust ----------------
admin_html = read("admin.html")
admin_html = admin_html.replace("style.css?v=16.3.0", "style.css?v=16.3.1")
admin_html = admin_html.replace("admin.js?v=16.3.0", "admin.js?v=16.3.1")
write("admin.html", admin_html)


# ---------------- style.css ----------------
style = read("style.css")
style += r'''

/* ===== v16.3.1: REJECT WORKFLOW ===== */
.photo-card.rejected{
  opacity:1 !important;
  outline:1px solid rgba(255,74,84,.48);
  box-shadow:inset 0 0 0 1px rgba(255,74,84,.18) !important;
}
.photo-card.rejected img{
  filter:grayscale(1) brightness(.52) contrast(.9) !important;
  opacity:.68 !important;
  transition:filter .2s ease,opacity .2s ease;
}
.photo-card.rejected::after{
  content:"× ODRZUCONE";
  position:absolute;
  z-index:2;
  left:10px;
  bottom:10px;
  padding:6px 9px;
  border:1px solid rgba(255,255,255,.22);
  border-radius:999px;
  background:rgba(139,22,34,.92);
  color:#fff;
  font-size:9px;
  font-weight:900;
  letter-spacing:.08em;
  pointer-events:none;
  box-shadow:0 6px 18px rgba(0,0,0,.32);
}
.photo-card-tools .photo-reject.active,
.photo-reject.active{
  background:#c72f43 !important;
  border-color:#e14a5d !important;
  color:#fff !important;
  box-shadow:0 0 0 2px rgba(225,74,93,.22);
}
.lightbox-stage img.rejected-preview{
  filter:grayscale(1) brightness(.52) contrast(.9);
  opacity:.72;
}
.rejected-count-summary{
  flex-shrink:0;
  color:#d8a4aa;
  font-size:13px;
  white-space:nowrap;
}
.rejected-count-summary strong{color:#ff7584}
.rejection-workflow{
  border-color:rgba(211,62,80,.42) !important;
  background:rgba(31,15,19,.97) !important;
}
.rejection-workflow-info{min-width:0}
.rejected-client-list{
  display:flex;
  flex-wrap:wrap;
  gap:6px;
  max-height:86px;
  overflow:auto;
  margin-top:9px;
  padding:8px;
  border:1px solid rgba(255,255,255,.08);
  border-radius:12px;
  background:rgba(0,0,0,.18);
}
.rejected-client-list span{
  padding:5px 8px;
  border-radius:999px;
  background:rgba(205,55,72,.14);
  border:1px solid rgba(226,80,97,.26);
  color:#ffc0c6;
  font-size:10px;
  font-weight:800;
}
.reject-approval-badge{color:#ffadb7 !important}
.rejection-approval-history{
  display:grid;
  gap:9px;
  margin:12px 0 16px;
  padding:12px;
  border:1px solid rgba(212,69,85,.28);
  border-radius:14px;
  background:rgba(91,23,31,.10);
}

@media(max-width:760px){
  .photo-card.rejected::after{
    left:7px;
    bottom:7px;
    padding:4px 6px;
    font-size:7px;
  }
  .rejected-count-summary{
    font-size:calc(12px * var(--gallery-mobile-ui-scale,.88));
  }
  .rejected-client-list{
    max-height:68px;
    gap:4px;
    padding:6px;
  }
  .rejected-client-list span{
    padding:4px 6px;
    font-size:8px;
  }
}
'''
write("style.css", style)


# Final sanity markers
checks = {
    "index.html": ["rejectionWorkflow", "rejectedCountSummary", "app.js?v=16.3.1"],
    "app.js": ["approveRejectedSelection", "clearAllRejected", "latestRejectionApproval", "selection-workflow:not([hidden])"],
    "admin.js": ["rejectionApprovalRowsForSlug", "LOG ZATWIERDZEŃ ODRZUCEŃ", "latestRejectionApprovalForSlug"],
    "style.css": ["v16.3.1: REJECT WORKFLOW", ".photo-card.rejected img", ".rejected-client-list"],
}
for path, markers in checks.items():
    text = read(path)
    for marker in markers:
        if marker not in text:
            raise RuntimeError(f"Missing marker {marker!r} in {path}")

print("v16.3.1 patch completed successfully")
