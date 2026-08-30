import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getDatabase, ref, get, set, remove, update, onValue } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";
import { getStorage, ref as sRef, listAll, getDownloadURL, uploadBytesResumable, deleteObject, updateMetadata } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js";
import { firebaseConfig, ADMIN_UID } from "./firebase-config.js?v=14.2";

const fb = initializeApp(firebaseConfig);
const auth = getAuth(fb);
const db = getDatabase(fb);
const storage = getStorage(fb);

const $ = (selector) => document.querySelector(selector);

let galleries = {};
let favoritesRoot = {};
let unsubscribeGalleries = null;
let uploadSlug = null;
let createdSlug = null;
let currentPhotosSlug = null;
let qrGallerySlug = null;
let qrInstance = null;


function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[c]));
}

function slugify(value) {
  return value.trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function normalizePassword(value) {
  return String(value ?? "").trim();
}

function displayName(filename) {
  return String(filename || "").replace(/\.(jpe?g|png|webp)$/i, "");
}

function manifestKey(filename) {
  const bytes = new TextEncoder().encode(filename);
  let binary = "";
  bytes.forEach(b => binary += String.fromCharCode(b));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function galleryUrl(slug) {
  const url = new URL(location.href);
  url.pathname = url.pathname.replace(/\/admin(?:\.html)?\/?$/i, "/");
  url.search = "";
  url.hash = "";
  url.searchParams.set("g", slug);
  return url.toString();
}


function formatDate(dateString) {
  if (!dateString) return "";
  const date = new Date(`${dateString}T12:00:00`);
  if (Number.isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString("pl-PL");
}

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function addDaysToIso(days) {
  const date = new Date();
  date.setHours(12,0,0,0);
  date.setDate(date.getDate() + Number(days || 0));
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function daysLeft(dateString) {
  if (!dateString) return null;
  const target = new Date(`${dateString}T23:59:59`);
  const now = new Date();
  const diff = Math.ceil((target - now) / 86400000);
  return diff;
}

function expiryBadgeText(pub) {
  if (!pub?.expiresAt) return "bez terminu";
  const left = daysLeft(pub.expiresAt);
  if (left === null) return `do ${formatDate(pub.expiresAt)}`;
  if (left < 0) return `wygasła ${formatDate(pub.expiresAt)}`;
  if (left === 0) return `wygasa dziś`;
  if (left === 1) return `jeszcze 1 dzień`;
  return `jeszcze ${left} dni`;
}

function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.hidden = false;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.hidden = true, 2200);
}

function showNotice(element, message, type = "ok") {
  element.textContent = message;
  element.className = `notice ${type}`;
  element.hidden = false;
}

function mergedSelectionForSlug(slug) {
  const galleryFavorites = favoritesRoot?.[slug] || {};
  const pub = galleries[slug]?.public || {};
  const manifest = Object.values(pub.photos || {}).filter(item => item?.filename);
  const max = Number(pub.maxFavorites || 0);

  const byExact = new Map(manifest.map(item => [String(item.filename), item.filename]));
  const byBase = new Map(manifest.map(item => [displayName(item.filename).toLowerCase(), item.filename]));
  const merged = new Map();

  const canonicalFilename = (filename) => {
    if (!filename) return null;
    if (byExact.has(String(filename))) return byExact.get(String(filename));
    return byBase.get(displayName(filename).toLowerCase()) || null;
  };

  // Prefer the new shared branch, but legacy branches may still exist until cleanup.
  Object.values(galleryFavorites).forEach(selection => {
    Object.values(selection || {}).forEach(item => {
      if (!item?.filename) return;
      const filename = canonicalFilename(item.filename);
      if (!filename) return; // ignore deleted/old files that are no longer in this gallery

      const key = displayName(filename).toLowerCase();
      const existing = merged.get(key);
      const candidate = { ...item, filename };

      // Keep the earliest real selection when duplicates exist.
      if (!existing || Number(candidate.selectedAt || 0) < Number(existing.selectedAt || 0)) {
        merged.set(key, candidate);
      }
    });
  });

  let items = [...merged.values()].sort((a, b) => {
    const timeDiff = Number(a.selectedAt || 0) - Number(b.selectedAt || 0);
    if (timeDiff) return timeDiff;
    return displayName(a.filename).localeCompare(displayName(b.filename), undefined, { numeric: true });
  });

  // A selection can never exceed the number of current photos or the gallery limit.
  const hardLimit = max > 0 ? Math.min(max, manifest.length) : manifest.length;
  if (hardLimit >= 0) items = items.slice(0, hardLimit);

  return items;
}

function selectionCountForSlug(slug) {
  return mergedSelectionForSlug(slug).length;
}

function galleryHasSelection(slug) {
  return selectionCountForSlug(slug) > 0;
}

function restoreSavedAdminLogin() {
  try {
    const raw = localStorage.getItem("raf-admin-login");
    if (!raw) return;

    const saved = JSON.parse(raw);

    if (saved?.email) $("#adminEmail").value = saved.email;
    if (saved?.password) $("#adminPassword").value = saved.password;
    if ($("#rememberAdminLogin")) $("#rememberAdminLogin").checked = true;
  } catch (error) {
    console.debug("Saved login restore failed:", error);
  }
}

function saveAdminLoginIfRequested() {
  const remember = $("#rememberAdminLogin")?.checked;

  if (!remember) {
    localStorage.removeItem("raf-admin-login");
    return;
  }

  localStorage.setItem(
    "raf-admin-login",
    JSON.stringify({
      email: $("#adminEmail").value.trim(),
      password: $("#adminPassword").value
    })
  );
}

restoreSavedAdminLogin();

onAuthStateChanged(auth, (user) => {
  if (user && user.uid === ADMIN_UID) {
    $("#adminLogin").hidden = true;
    $("#adminPanel").hidden = false;
    $("#adminEmailLabel").textContent = user.email || "Administrator";

    if (unsubscribeGalleries) unsubscribeGalleries();

    unsubscribeGalleries = onValue(
      ref(db, "galleries"),
      (snapshot) => {
        galleries = snapshot.exists() ? snapshot.val() : {};
        renderAll();

      },
      (error) => {
        console.error("GALLERIES READ ERROR", error);
        showNotice($("#globalMessage"), `Błąd odczytu galerii: ${error.code || error.message}`, "error");
      }
    );

    onValue(
      ref(db, "favorites"),
      (snapshot) => {
        favoritesRoot = snapshot.exists() ? snapshot.val() : {};
        renderAll();
      },
      (error) => {
        console.error("FAVORITES READ ERROR", error);
      }
    );
  } else {
    if (unsubscribeGalleries) {
      unsubscribeGalleries();
      unsubscribeGalleries = null;
    }

    $("#adminLogin").hidden = false;
    $("#adminPanel").hidden = true;

    if (user && user.uid !== ADMIN_UID) signOut(auth);
  }
});

$("#adminLoginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("#adminLoginError").hidden = true;

  try {
    const credential = await signInWithEmailAndPassword(
      auth,
      $("#adminEmail").value.trim(),
      $("#adminPassword").value
    );

    if (credential.user.uid !== ADMIN_UID) {
      await signOut(auth);
      throw new Error("To konto nie ma uprawnień administratora.");
    }

    // Remember only the email ourselves.
    // Password is left to Chrome/Edge password manager.
    saveAdminLoginIfRequested();
  } catch (error) {
    console.error("ADMIN LOGIN ERROR", error);
    $("#adminLoginError").textContent = error.message || String(error);
    $("#adminLoginError").hidden = false;
  }
});


const togglePasswordButton = $("#toggleAdminPassword");
if (togglePasswordButton) {
  togglePasswordButton.addEventListener("click", (event) => {
    event.preventDefault();

    const input = $("#adminPassword");
    if (!input) return;

    const willShow = input.type === "password";
    input.type = willShow ? "text" : "password";
    togglePasswordButton.textContent = willShow ? "Ukryj hasło" : "Pokaż hasło";
  });
}

$("#adminLogoutBtn").addEventListener("click", () => signOut(auth));


function renderAll() {
  const entries = Object.entries(galleries);
  $("#statGalleries").textContent = entries.length;
  $("#statPhotos").textContent = entries.reduce((sum, [, g]) => {
    const pub = g?.public || {};
    const manifestCount = Object.keys(pub.photos || {}).length;
    return sum + (manifestCount || Number(pub.photoCount || 0));
  }, 0);
  $("#statSelections").textContent = entries.filter(([slug]) => galleryHasSelection(slug)).length;
  renderCards();
}

function filteredEntries() {
  const query = $("#gallerySearch").value.trim().toLowerCase();
  const status = $("#galleryStatusFilter").value;

  return Object.entries(galleries)
    .filter(([slug, gallery]) => {
      const pub = gallery?.public || {};
      const matchesQuery = !query ||
        (pub.title || "").toLowerCase().includes(query) ||
        slug.toLowerCase().includes(query);

      const matchesStatus =
        status === "all" ||
        (status === "active" && pub.active !== false) ||
        (status === "inactive" && pub.active === false);

      return matchesQuery && matchesStatus;
    })
    .sort((a, b) => (b[1]?.public?.createdAt || 0) - (a[1]?.public?.createdAt || 0));
}

function renderCards() {
  const list = $("#galleryList");
  list.innerHTML = "";

  const entries = filteredEntries();

  if (!entries.length) {
    list.innerHTML = '<div class="notice">Brak galerii.</div>';
    return;
  }

  entries.forEach(([slug, gallery]) => {
    const pub = gallery?.public || {};
    const selectedCount = selectionCountForSlug(slug);
    const photoCount = Object.keys(pub.photos || {}).length || Number(pub.photoCount || 0);

    const card = document.createElement("article");
    card.className = "gallery-card";

    card.innerHTML = `
      <div class="gallery-cover">
        <div class="gallery-status ${pub.active === false ? "off" : ""}">
          ${pub.active === false ? "Wyłączona" : "Aktywna"}
        </div>
      </div>

      <div class="gallery-body">
        <h3>${escapeHtml(pub.title || slug)}</h3>

        <div class="gallery-meta">
          <span>${photoCount} zdjęć</span>
          <span>♥ ${selectedCount} wybranych zdjęć</span>
          <span>${pub.maxFavorites ? `limit ${pub.maxFavorites}` : "bez limitu"}</span>
          <span>${escapeHtml(expiryBadgeText(pub))}</span>
          ${pub.eventDate ? `<span>${escapeHtml(formatDate(pub.eventDate))}</span>` : ""}
        </div>

        <div class="gallery-link">
          <input readonly value="${galleryUrl(slug)}">
          <button type="button" class="ghost" data-copy="${slug}">Kopiuj</button>
        </div>

        <div class="gallery-actions">
          <button type="button" class="primary" data-upload="${slug}">+ Zdjęcia</button>
          <button type="button" class="ghost" data-manage="${slug}">Zarządzaj</button><button type="button" class="ghost" data-repair="${slug}">⚙ Napraw pobieranie</button>
          <button type="button" class="ghost" data-select="${slug}">♥ Wybory</button>
          <button type="button" class="ghost" data-qr="${slug}">QR</button>
          <button type="button" class="ghost" data-edit="${slug}">Ustawienia</button>
          <a class="ghost" href="${galleryUrl(slug)}" target="_blank" rel="noopener">Otwórz</a>
        </div>
      </div>
    `;

    list.appendChild(card);
    loadCover(card.querySelector(".gallery-cover"), pub.coverFile, pub.photos, pub.coverPositionX, pub.coverPositionY);
  });

  list.querySelectorAll("[data-copy]").forEach(button => {
    button.addEventListener("click", async () => {
      await navigator.clipboard.writeText(galleryUrl(button.dataset.copy));
      toast("Link skopiowany");
    });
  });

  list.querySelectorAll("[data-upload]").forEach(button =>
    button.addEventListener("click", () => openUpload(button.dataset.upload))
  );

  list.querySelectorAll("[data-manage]").forEach(button =>
    button.addEventListener("click", () => openPhotos(button.dataset.manage))
  );

  list.querySelectorAll("[data-repair]").forEach(button =>
    button.addEventListener("click", () => repairDownloadMetadata(button.dataset.repair, button))
  );

  list.querySelectorAll("[data-select]").forEach(button =>
    button.addEventListener("click", () => openSelections(button.dataset.select))
  );

  list.querySelectorAll("[data-qr]").forEach(button =>
    button.addEventListener("click", () => openQrDialog(button.dataset.qr))
  );

  list.querySelectorAll("[data-edit]").forEach(button =>
    button.addEventListener("click", () => openEdit(button.dataset.edit))
  );
}

function loadCover(element, coverFile, manifest, coverX = 50, coverY = 38) {
  if (!coverFile || !manifest) return;
  const match = Object.values(manifest).find(item => item?.filename === coverFile && item?.previewUrl);
  if (match) {
    element.style.backgroundImage = `url("${match.previewUrl}")`;
    element.style.backgroundPosition = `${coverX}% ${coverY}%`;
  }
}

$("#gallerySearch").addEventListener("input", renderCards);
$("#galleryStatusFilter").addEventListener("change", renderCards);

function resetForm() {
  $("#editingSlug").value = "";
  $("#galleryTitleInput").value = "";
  $("#gallerySlugInput").value = "";
  $("#gallerySlugInput").disabled = false;
  $("#galleryPasswordInput").value = "";
  $("#gallerySubtitleInput").value = "";
  $("#introMessageInput").value = "";
  $("#eventDateInput").value = "";
  $("#outroMessageInput").value = "";
  $("#instagramInput").value = "";
  $("#websiteInput").value = "";
  $("#expiresAtInput").value = "";
  $("#maxFavoritesInput").value = "0";
  $("#validDaysInput").value = "0";
  $("#downloadsEnabledInput").checked = true;
  $("#galleryActiveInput").checked = true;
  $("#deleteGalleryBtn").hidden = true;
  $("#saveStatus").hidden = true;
}

$("#newGalleryBtn").addEventListener("click", () => {
  resetForm();
  $("#dialogTitle").textContent = "Nowa galeria";
  $("#galleryDialog").showModal();
});

function openEdit(slug) {
  const pub = galleries[slug]?.public || {};

  resetForm();

  $("#dialogTitle").textContent = "Ustawienia galerii";
  $("#editingSlug").value = slug;
  $("#galleryTitleInput").value = pub.title || "";
  $("#gallerySlugInput").value = slug;
  $("#gallerySlugInput").disabled = true;
  $("#gallerySubtitleInput").value = pub.subtitle || "";
  $("#introMessageInput").value = pub.introMessage || "";
  $("#eventDateInput").value = pub.eventDate || "";
  $("#outroMessageInput").value = pub.outroMessage || "";
  $("#instagramInput").value = pub.instagram || "";
  $("#websiteInput").value = pub.website || "";
  $("#validDaysInput").value = Number(pub.validDays || 0);
  $("#expiresAtInput").value = pub.expiresAt || "";
  $("#maxFavoritesInput").value = Number(pub.maxFavorites || 0);
  $("#downloadsEnabledInput").checked = pub.downloadsEnabled !== false;
  $("#galleryActiveInput").checked = pub.active !== false;
  $("#deleteGalleryBtn").hidden = false;

  $("#galleryDialog").showModal();
}

$("#galleryForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  const button = $("#saveGalleryBtn");
  button.disabled = true;
  button.textContent = "Zapisywanie…";
  $("#saveStatus").hidden = true;

  try {
    const editingSlug = $("#editingSlug").value;
    const slug = editingSlug || slugify($("#gallerySlugInput").value);

    if (!slug) throw new Error("Podaj poprawny adres galerii.");

    if (!editingSlug && galleries[slug]) {
      throw new Error("Galeria o takim adresie już istnieje.");
    }

    const old = galleries[slug]?.public || {};
    const enteredPassword = $("#galleryPasswordInput").value;
    const validDays = Math.max(0, Number($("#validDaysInput").value || 0));

    let passwordHash = old.passwordHash || "";
    let passwordHashTrimmed = old.passwordHashTrimmed || old.passwordHash || "";

    if (enteredPassword) {
      const normalizedPassword = normalizePassword(enteredPassword);

      if (!normalizedPassword) throw new Error("Hasło nie może składać się ze spacji.");

      passwordHash = await sha256(normalizedPassword);
      passwordHashTrimmed = passwordHash;
    }

    if (!passwordHash && !passwordHashTrimmed) throw new Error("Ustaw hasło klienta.");

    let expiresAt = $("#expiresAtInput").value || "";
    if (validDays > 0) expiresAt = addDaysToIso(validDays);

    const data = {
      ...old,
      title: $("#galleryTitleInput").value.trim() || slug,
      subtitle: $("#gallerySubtitleInput").value.trim(),
      introMessage: $("#introMessageInput").value.trim(),
      eventDate: $("#eventDateInput").value || "",
      outroMessage: $("#outroMessageInput").value.trim(),
      instagram: $("#instagramInput").value.trim(),
      website: $("#websiteInput").value.trim(),
      passwordHash,
      passwordHashTrimmed,
      passwordVersion: 2,
      validDays,
      expiresAt,
      maxFavorites: Number($("#maxFavoritesInput").value || 0),
      downloadsEnabled: $("#downloadsEnabledInput").checked,
      active: $("#galleryActiveInput").checked,
      photoCount: Number(old.photoCount || 0),
      photos: old.photos || {},
      coverFile: old.coverFile || "",
      coverPositionX: Number(old.coverPositionX ?? 50),
      coverPositionY: Number(old.coverPositionY ?? 38),
      createdAt: old.createdAt || Date.now(),
      updatedAt: Date.now()
    };

    await set(ref(db, `galleries/${slug}/public`), data);

    $("#galleryDialog").close();

    if (!editingSlug) {
      createdSlug = slug;
      $("#createdLink").value = galleryUrl(slug);
      $("#createdDialog").showModal();
    } else {
      toast("Ustawienia zapisane");
    }
  } catch (error) {
    console.error("SAVE GALLERY ERROR", error);
    showNotice($("#saveStatus"), `Nie udało się zapisać: ${error.code || error.message || error}`, "error");
  } finally {
    button.disabled = false;
    button.textContent = "Zapisz";
  }
});

async function deleteFolder(path) {
  const folder = sRef(storage, path);
  const result = await listAll(folder);

  for (const item of result.items) {
    await deleteObject(item).catch(error => {
      console.warn("DELETE STORAGE FILE ERROR", item.fullPath, error);
    });
  }

  for (const prefix of result.prefixes) {
    await deleteFolder(prefix.fullPath);
  }
}

$("#deleteGalleryBtn").addEventListener("click", async () => {
  const slug = $("#editingSlug").value;
  if (!slug) return;

  const title = galleries[slug]?.public?.title || slug;

  if (!confirm(`Usunąć galerię „${title}” razem ze zdjęciami i wyborami klientów?`)) return;

  const button = $("#deleteGalleryBtn");
  button.disabled = true;
  button.textContent = "Usuwanie…";
  $("#saveStatus").hidden = true;

  try {
    await deleteFolder(`galleries/${slug}`);
    await remove(ref(db, `favorites/${slug}`)).catch(() => {});
    await remove(ref(db, `galleries/${slug}`));

    $("#galleryDialog").close();
    toast("Galeria została usunięta");
  } catch (error) {
    console.error("DELETE GALLERY ERROR", error);
    showNotice($("#saveStatus"), `Nie udało się usunąć: ${error.code || error.message || error}`, "error");
  } finally {
    button.disabled = false;
    button.textContent = "Usuń galerię";
  }
});

$("#closeGalleryDialog").addEventListener("click", () => $("#galleryDialog").close());
$("#cancelGalleryBtn").addEventListener("click", () => $("#galleryDialog").close());

$("#copyCreatedLink").addEventListener("click", async () => {
  await navigator.clipboard.writeText($("#createdLink").value);
  toast("Link skopiowany");
});

$("#openCreatedGalleryBtn").addEventListener("click", () => {
  if (createdSlug) window.open(galleryUrl(createdSlug), "_blank", "noopener");
});

$("#addPhotosNowBtn").addEventListener("click", () => {
  if (!createdSlug) return;
  $("#createdDialog").close();
  openUpload(createdSlug);
});

function openUpload(slug) {
  uploadSlug = slug;
  $("#uploadTitle").textContent = `Dodaj zdjęcia — ${galleries[slug]?.public?.title || slug}`;
  $("#photoFilesInput").value = "";
  $("#uploadFileCount").textContent = "0 plików";
  $("#uploadSize").textContent = "0 MB";
  $("#uploadProgress").style.width = "0%";
  $("#uploadStatus").hidden = true;
  $("#uploadDialog").showModal();
}

const dropZone = $("#dropZone");

["dragenter", "dragover"].forEach(type => {
  dropZone.addEventListener(type, event => event.preventDefault());
});

dropZone.addEventListener("drop", event => {
  event.preventDefault();

  const transfer = new DataTransfer();

  [...event.dataTransfer.files]
    .filter(file =>
      ["image/jpeg","image/png","image/webp"].includes(file.type) ||
      /\.(jpe?g|png|webp)$/i.test(file.name)
    )
    .forEach(file => transfer.items.add(file));

  $("#photoFilesInput").files = transfer.files;
  updateFileMeta();
});

$("#photoFilesInput").addEventListener("change", updateFileMeta);

function updateFileMeta() {
  const files = [...$("#photoFilesInput").files];
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);

  $("#uploadFileCount").textContent = `${files.length} plików`;
  $("#uploadSize").textContent = `${(totalBytes / 1024 / 1024).toFixed(1)} MB`;
}

function imageContentType(file) {
  if (file.type && ["image/jpeg","image/png","image/webp"].includes(file.type)) {
    return file.type;
  }

  const lower = file.name.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawPreviewWatermark(ctx, width, height) {
  const pad = Math.max(14, Math.round(Math.min(width, height) * 0.02));
  const fontSize = Math.max(16, Math.round(Math.min(width, height) * 0.035));
  const text = "RAF.studio";

  ctx.save();
  ctx.font = `700 ${fontSize}px Arial, sans-serif`;
  const metrics = ctx.measureText(text);
  const textWidth = Math.ceil(metrics.width);
  const boxW = textWidth + pad * 1.6;
  const boxH = fontSize + pad * 0.9;
  const x = width - boxW - pad;
  const y = height - boxH - pad;

  ctx.globalAlpha = 0.42;
  ctx.fillStyle = "#000";
  roundedRect(ctx, x, y, boxW, boxH, Math.max(10, Math.round(boxH * 0.28)));
  ctx.fill();

  ctx.globalAlpha = 0.85;
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + pad * 0.8, y + boxH / 2 + 1);
  ctx.restore();
}

async function makePreview(file) {
  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Nie udało się otworzyć ${file.name}`));
      img.src = objectUrl;
    });

    const variants = [
      { max: 1600, quality: 0.76 },
      { max: 1500, quality: 0.70 },
      { max: 1400, quality: 0.66 },
      { max: 1280, quality: 0.62 }
    ];

    let lastBlob = null;

    for (const variant of variants) {
      let width = image.naturalWidth;
      let height = image.naturalHeight;
      const scale = Math.min(1, variant.max / Math.max(width, height));

      width = Math.max(1, Math.round(width * scale));
      height = Math.max(1, Math.round(height * scale));

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0, width, height);
      drawPreviewWatermark(context, width, height);

      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          result => result ? resolve(result) : reject(new Error("Nie udało się utworzyć podglądu.")),
          "image/webp",
          variant.quality
        );
      });

      lastBlob = blob;
      if (blob.size <= 650 * 1024) break;
    }

    return {
      blob: lastBlob,
      width: image.naturalWidth,
      height: image.naturalHeight,
      orientation: image.naturalHeight > image.naturalWidth ? "portrait" : image.naturalWidth > image.naturalHeight ? "landscape" : "square"
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function uploadTask(storageRef, data, metadata, onProgress) {
  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, data, {
      cacheControl: "public,max-age=31536000,immutable",
      ...metadata
    });

    task.on(
      "state_changed",
      snapshot => {
        const fraction = snapshot.totalBytes
          ? snapshot.bytesTransferred / snapshot.totalBytes
          : 0;
        onProgress(fraction);
      },
      reject,
      resolve
    );
  });
}

$("#startUploadBtn").addEventListener("click", async () => {
  const files = [...$("#photoFilesInput").files];

  if (!uploadSlug || !files.length) {
    showNotice($("#uploadStatus"), "Wybierz zdjęcia JPG, JPEG, PNG lub WEBP.", "error");
    return;
  }

  const button = $("#startUploadBtn");
  button.disabled = true;
  button.textContent = "Wysyłanie…";

  try {
    for (let index = 0; index < files.length; index++) {
      const file = files[index];
      const base = index / files.length;
      const weight = 1 / files.length;

      showNotice($("#uploadStatus"), `${index + 1}/${files.length}: ${file.name} — tworzę podgląd…`);

      const previewData = await makePreview(file);
      const previewName = `${file.name}.webp`;
      const previewRef = sRef(storage, `galleries/${uploadSlug}/previews/${previewName}`);

      await uploadTask(
        previewRef,
        previewData.blob,
        {
          contentType: "image/webp",
          contentDisposition: `attachment; filename="${file.name}.webp"`
        },
        fraction => {
          $("#uploadProgress").style.width = `${Math.round((base + weight * fraction * 0.15) * 100)}%`;
        }
      );

      const previewUrl = await getDownloadURL(previewRef);

      showNotice($("#uploadStatus"), `${index + 1}/${files.length}: ${file.name} — wysyłam oryginał…`);

      const originalRef = sRef(storage, `galleries/${uploadSlug}/originals/${file.name}`);

      await uploadTask(
        originalRef,
        file,
        {
          contentType: imageContentType(file),
          contentDisposition: `attachment; filename="${file.name.replaceAll('"', '')}"`
        },
        fraction => {
          $("#uploadProgress").style.width = `${Math.round((base + weight * (0.15 + fraction * 0.85)) * 100)}%`;
        }
      );

      await update(ref(db, `galleries/${uploadSlug}/public/photos/${manifestKey(file.name)}`), {
        filename: file.name,
        previewUrl,
        originalPath: `galleries/${uploadSlug}/originals/${file.name}`,
        width: previewData.width,
        height: previewData.height,
        orientation: previewData.orientation
      });

      if (!galleries[uploadSlug]?.public?.coverFile) {
        await update(ref(db, `galleries/${uploadSlug}/public`), {
          coverFile: file.name
        });
      }
    }

    const manifest = galleries[uploadSlug]?.public?.photos || {};
    const currentCount = Object.keys(manifest).length;
    const uploadedNames = files.map(file => file.name);
    const uniqueNew = uploadedNames.filter(name =>
      !Object.values(manifest).some(item => item?.filename === name)
    ).length;

    await update(ref(db, `galleries/${uploadSlug}/public`), {
      photoCount: currentCount + uniqueNew,
      downloadMetadataVersion: 2,
      updatedAt: Date.now()
    });

    $("#uploadProgress").style.width = "100%";
    showNotice($("#uploadStatus"), `Gotowe — wysłano ${files.length} zdjęć.`, "ok");
  } catch (error) {
    console.error("UPLOAD ERROR", error);
    showNotice($("#uploadStatus"), `Błąd wysyłania: ${error.code || error.message || error}`, "error");
  } finally {
    button.disabled = false;
    button.textContent = "Wyślij zdjęcia";
  }
});

$("#closeUploadDialog").addEventListener("click", () => $("#uploadDialog").close());
$("#cancelUploadBtn").addEventListener("click", () => $("#uploadDialog").close());

async function repairDownloadMetadata(slug, button) {
  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = "Naprawiam…";

  try {
    const [originals, previews] = await Promise.all([
      listAll(sRef(storage, `galleries/${slug}/originals`)),
      listAll(sRef(storage, `galleries/${slug}/previews`))
    ]);

    const all = [...originals.items, ...previews.items];
    let done = 0;

    for (const item of all) {
      const lower = item.name.toLowerCase();

      const contentType =
        lower.endsWith(".png") ? "image/png" :
        lower.endsWith(".webp") ? "image/webp" :
        "image/jpeg";

      const downloadName = item.name.endsWith(".webp") && item.fullPath.includes("/previews/")
        ? item.name.slice(0, -5)
        : item.name;

      await updateMetadata(item, {
        contentType,
        contentDisposition: `attachment; filename="${downloadName.replaceAll('"', '')}"`
      });

      done++;
      button.textContent = `Naprawiam ${done}/${all.length}`;
    }

    await update(ref(db, `galleries/${slug}/public`), {
      downloadMetadataVersion: 4,
      updatedAt: Date.now()
    });

    toast(`Pobieranie naprawione dla ${done} plików.`);
  } catch (error) {
    console.error("REPAIR DOWNLOAD METADATA ERROR", error);
    toast(`Nie udało się naprawić: ${error.code || error.message || error}`);
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
  }
}


function syncCoverEditor(slug) {
  const pub = galleries[slug]?.public || {};
  const coverEditor = $("#coverEditor");
  const coverPreview = $("#coverPreview");
  if (!coverEditor || !coverPreview) return;

  const match = Object.values(pub.photos || {}).find(item => item?.filename === pub.coverFile && item?.previewUrl);
  if (!match) {
    coverEditor.hidden = true;
    return;
  }

  const x = Number(pub.coverPositionX ?? 50);
  const y = Number(pub.coverPositionY ?? 38);

  $("#coverPositionXInput").value = x;
  $("#coverPositionYInput").value = y;
  $("#coverEditorTitle").textContent = `Kadrowanie okładki — ${pub.coverFile}`;
  coverPreview.style.backgroundImage = `url("${match.previewUrl}")`;
  coverPreview.style.backgroundPosition = `${x}% ${y}%`;
  coverEditor.hidden = false;
}

function previewCoverPosition() {
  const coverPreview = $("#coverPreview");
  if (!coverPreview) return;
  coverPreview.style.backgroundPosition = `${$("#coverPositionXInput").value}% ${$("#coverPositionYInput").value}%`;
}

async function openQrDialog(slug) {
  qrGallerySlug = slug;
  const url = galleryUrl(slug);
  $("#qrLink").value = url;

  const canvas = $("#qrCanvas");
  if (window.QRious) {
    if (!qrInstance) {
      qrInstance = new window.QRious({
        element: canvas,
        size: 280,
        value: url,
        level: "H",
        foreground: "#111111",
        background: "#ffffff"
      });
    } else {
      qrInstance.value = url;
      qrInstance.size = 280;
    }
  }

  $("#qrDialog").showModal();
}

async function openPhotos(slug) {
  currentPhotosSlug = slug;
  $("#photosTitle").textContent = `Zdjęcia — ${galleries[slug]?.public?.title || slug}`;
  $("#photoManagerGrid").innerHTML = "";
  $("#photoManagerLoading").hidden = false;
  $("#coverEditor").hidden = true;
  $("#photosDialog").showModal();
  syncCoverEditor(slug);

  try {
    const result = await listAll(sRef(storage, `galleries/${slug}/previews`));

    const items = [...result.items].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

    for (const previewRef of items) {
      const previewUrl = await getDownloadURL(previewRef);
      const originalName = previewRef.name.endsWith(".webp")
        ? previewRef.name.slice(0, -5)
        : previewRef.name;

      const item = document.createElement("article");
      item.className = `pm-item${galleries[slug]?.public?.coverFile === originalName ? " current-cover" : ""}`;

      item.innerHTML = `
        <div class="pm-thumb" style="background-image:url('${previewUrl}')"></div>
        <div class="pm-info">
          <div class="pm-name" title="${escapeHtml(displayName(originalName))}">${escapeHtml(displayName(originalName))}</div>
          <div class="pm-actions">
            <button type="button" class="ghost cover">Okładka</button>
            <button type="button" class="danger delete">Usuń</button>
          </div>
        </div>
      `;

      item.querySelector(".cover").addEventListener("click", async () => {
        await update(ref(db, `galleries/${slug}/public`), { coverFile: originalName, updatedAt: Date.now() });
        syncCoverEditor(slug);
        toast("Ustawiono okładkę");
      });

      item.querySelector(".delete").addEventListener("click", async () => {
        if (!confirm(`Usunąć zdjęcie ${originalName}?`)) return;

        try {
          await deleteObject(previewRef);
          await deleteObject(sRef(storage, `galleries/${slug}/originals/${originalName}`)).catch(() => {});
          await remove(ref(db, `galleries/${slug}/public/photos/${manifestKey(originalName)}`));

          item.remove();

          const remaining = await listAll(sRef(storage, `galleries/${slug}/previews`));
          await update(ref(db, `galleries/${slug}/public`), {
            photoCount: remaining.items.length
          });

          toast("Zdjęcie usunięte");
        } catch (error) {
          console.error("DELETE PHOTO ERROR", error);
          toast(`Nie udało się usunąć: ${error.code || error.message}`);
        }
      });

      $("#photoManagerGrid").appendChild(item);
    }
  } catch (error) {
    $("#photoManagerGrid").innerHTML = `<div class="notice error">Błąd: ${escapeHtml(error.code || error.message || error)}</div>`;
  } finally {
    syncCoverEditor(slug);
    $("#photoManagerLoading").hidden = true;
  }
}

$("#closePhotosDialog").addEventListener("click", () => $("#photosDialog").close());

$("#coverPositionXInput")?.addEventListener("input", previewCoverPosition);
$("#coverPositionYInput")?.addEventListener("input", previewCoverPosition);
$("#saveCoverPositionBtn")?.addEventListener("click", async () => {
  if (!currentPhotosSlug) return;
  const button = $("#saveCoverPositionBtn");
  const original = button.textContent;
  button.disabled = true;
  button.textContent = "Zapisywanie…";
  try {
    await update(ref(db, `galleries/${currentPhotosSlug}/public`), {
      coverPositionX: Number($("#coverPositionXInput").value || 50),
      coverPositionY: Number($("#coverPositionYInput").value || 38),
      updatedAt: Date.now()
    });
    syncCoverEditor(currentPhotosSlug);
    toast("Kadr okładki zapisany");
  } catch (error) {
    console.error("SAVE COVER POSITION ERROR", error);
    toast(`Nie udało się zapisać kadru: ${error.code || error.message || error}`);
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
});

$("#closeQrDialog")?.addEventListener("click", () => $("#qrDialog").close());
$("#copyQrLinkBtn")?.addEventListener("click", async () => {
  await navigator.clipboard.writeText($("#qrLink").value);
  toast("Link skopiowany");
});
$("#openQrGalleryBtn")?.addEventListener("click", () => {
  if (qrGallerySlug) window.open(galleryUrl(qrGallerySlug), "_blank", "noopener");
});
$("#downloadQrBtn")?.addEventListener("click", () => {
  const canvas = $("#qrCanvas");
  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png");
  link.download = `${qrGallerySlug || "galeria"}-qr.png`;
  link.click();
});

function startAdminAttachmentDownload(url, filename) {
  const frame = document.createElement("iframe");
  frame.className = "raf-download-frame";
  frame.title = `Pobieranie ${filename}`;
  frame.src = url;
  document.body.appendChild(frame);
  setTimeout(() => frame.remove(), 90000);
}

async function getAdminPhotoDownloadUrl(slug, filename) {
  const pub = galleries[slug]?.public || {};
  const manifestItems = Object.values(pub.photos || {});
  const manifestItem = manifestItems.find(item => item?.filename === filename) ||
    manifestItems.find(item => displayName(item?.filename).toLowerCase() === displayName(filename).toLowerCase());
  const canonicalFilename = manifestItem?.filename || filename;
  const candidates = [manifestItem?.originalPath, `galleries/${slug}/originals/${canonicalFilename}`].filter(Boolean);
  for (const path of [...new Set(candidates)]) {
    try { return await getDownloadURL(sRef(storage, path)); } catch (_) {}
  }
  if (manifestItem?.previewUrl) return manifestItem.previewUrl;
  return null;
}

async function migrateLegacyFavoritesToShared(slug) {
  const items = mergedSelectionForSlug(slug);
  const pub = galleries[slug]?.public || {};

  const cleanShared = {};
  items.forEach(item => {
    cleanShared[manifestKey(item.filename)] = {
      filename: item.filename,
      selectedAt: Number(item.selectedAt || Date.now())
    };
  });

  try {
    // Replace the whole favorites tree for this gallery with one clean shared selection.
    // This removes old anonymous client IDs, deleted filenames and anything above the limit.
    await set(ref(db, `favorites/${slug}`), { shared: cleanShared });
    await update(ref(db, `galleries/${slug}/public`), {
      selectionMigrationVersion: 3,
      updatedAt: Date.now()
    });
  } catch (error) {
    console.warn("FAVORITES CLEANUP ERROR", error);
  }

  return items;
}

async function downloadAdminSelected(slug, items, button) {
  if (!items.length) return;
  const originalLabel = button?.textContent || "♥ Pobierz wybrane";
  if (button) button.disabled = true;
  try {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (button) button.textContent = `Pobieram ${i + 1}/${items.length}…`;
      const url = await getAdminPhotoDownloadUrl(slug, item.filename);
      if (url) startAdminAttachmentDownload(url, item.filename);
      await new Promise(resolve => setTimeout(resolve, 1100));
    }
    toast(`Uruchomiono pobieranie ${items.length} zdjęć.`);
  } finally {
    if (button) { button.disabled = false; button.textContent = originalLabel; }
  }
}

function downloadText(filename, content, type = "text/plain") {
  const blob = new Blob([content], { type });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

async function openSelections(slug) {
  const gallery = galleries[slug] || {};
  const container = $("#selectionContent");
  $("#selectionTitle").textContent = `${gallery.public?.title || slug} — wybrane zdjęcia klienta`;
  container.innerHTML = '<div class="loading">Ładowanie wyboru…</div>';
  $("#selectionDialog").showModal();

  const items = await migrateLegacyFavoritesToShared(slug);
  container.innerHTML = "";
  if (!items.length) {
    container.innerHTML = '<div class="notice">Klient nie zaznaczył jeszcze żadnego zdjęcia.</div>';
    return;
  }

  const block = document.createElement("section");
  block.className = "selection-client selection-single";
  block.innerHTML = `
    <div class="selection-single-head">
      <div>
        <h3>♥ Wybrane zdjęcia klienta</h3>
        <div class="gallery-meta"><span>${items.length} zdjęć</span></div>
      </div>
      <button type="button" class="primary download-all">♥ Pobierz wybrane (${items.length})</button>
    </div>
    <div class="selection-photo-grid"></div>
  `;

  const grid = block.querySelector(".selection-photo-grid");
  for (const item of items) {
    const manifestItems = Object.values(gallery.public?.photos || {});
    const manifestItem = manifestItems.find(photo => photo?.filename === item.filename) ||
      manifestItems.find(photo => displayName(photo?.filename).toLowerCase() === displayName(item.filename).toLowerCase());
    const card = document.createElement("article");
    card.className = "selection-photo-card";
    card.innerHTML = `
      <div class="selection-photo-thumb" ${manifestItem?.previewUrl ? `style="background-image:url('${manifestItem.previewUrl}')"` : ""}></div>
      <div class="selection-photo-info">
        <strong>${escapeHtml(displayName(item.filename))}</strong>
        <button type="button" class="ghost download-one">↓ Pobierz</button>
      </div>
    `;
    card.querySelector(".download-one").addEventListener("click", async () => {
      const url = await getAdminPhotoDownloadUrl(slug, item.filename);
      if (url) startAdminAttachmentDownload(url, item.filename);
      else toast(`Nie znaleziono pliku ${displayName(item.filename)}`);
    });
    grid.appendChild(card);
  }

  block.querySelector(".download-all").addEventListener("click", (event) =>
    downloadAdminSelected(slug, items, event.currentTarget)
  );
  container.appendChild(block);
}

$("#closeSelectionDialog").addEventListener("click", () => $("#selectionDialog").close());