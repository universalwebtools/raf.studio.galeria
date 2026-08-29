import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getDatabase, ref, get, set, remove, update, onValue } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";
import { getStorage, ref as sRef, listAll, getDownloadURL, uploadBytesResumable, deleteObject } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js";
import { firebaseConfig, ADMIN_UID } from "./firebase-config.js?v=11.2";

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

function manifestKey(filename) {
  const bytes = new TextEncoder().encode(filename);
  let binary = "";
  bytes.forEach(b => binary += String.fromCharCode(b));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function galleryUrl(slug) {
  return `${location.href.replace(/admin\.html.*$/,"")}?g=${encodeURIComponent(slug)}`;
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

function selectionCountForSlug(slug) {
  const galleryFavorites = favoritesRoot?.[slug] || {};
  return Object.values(galleryFavorites).filter(clientSelection =>
    Object.values(clientSelection || {}).some(item => item?.filename)
  ).length;
}

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
  } catch (error) {
    console.error("ADMIN LOGIN ERROR", error);
    $("#adminLoginError").textContent = error.message || String(error);
    $("#adminLoginError").hidden = false;
  }
});

$("#adminLogoutBtn").addEventListener("click", () => signOut(auth));

function renderAll() {
  const entries = Object.values(galleries);
  $("#statGalleries").textContent = entries.length;
  $("#statPhotos").textContent = entries.reduce((sum, g) => sum + Number(g?.public?.photoCount || 0), 0);
  $("#statSelections").textContent = Object.keys(galleries).reduce((sum, slug) => sum + selectionCountForSlug(slug), 0);
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
    const selectedClients = selectionCountForSlug(slug);

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
          <span>${Number(pub.photoCount || 0)} zdjęć</span>
          <span>${selectedClients} klientów z wyborem</span>
          <span>${pub.maxFavorites ? `limit ${pub.maxFavorites}` : "bez limitu"}</span>
        </div>

        <div class="gallery-link">
          <input readonly value="${galleryUrl(slug)}">
          <button type="button" class="ghost" data-copy="${slug}">Kopiuj</button>
        </div>

        <div class="gallery-actions">
          <button type="button" class="primary" data-upload="${slug}">+ Zdjęcia</button>
          <button type="button" class="ghost" data-manage="${slug}">Zarządzaj</button>
          <button type="button" class="ghost" data-select="${slug}">♥ Wybory</button>
          <button type="button" class="ghost" data-edit="${slug}">Ustawienia</button>
          <a class="ghost" href="${galleryUrl(slug)}" target="_blank" rel="noopener">Otwórz</a>
        </div>
      </div>
    `;

    list.appendChild(card);
    loadCover(card.querySelector(".gallery-cover"), pub.coverFile, pub.photos);
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

  list.querySelectorAll("[data-select]").forEach(button =>
    button.addEventListener("click", () => openSelections(button.dataset.select))
  );

  list.querySelectorAll("[data-edit]").forEach(button =>
    button.addEventListener("click", () => openEdit(button.dataset.edit))
  );
}

function loadCover(element, coverFile, manifest) {
  if (!coverFile || !manifest) return;
  const match = Object.values(manifest).find(item => item?.filename === coverFile && item?.previewUrl);
  if (match) element.style.backgroundImage = `url("${match.previewUrl}")`;
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
  $("#expiresAtInput").value = "";
  $("#maxFavoritesInput").value = "0";
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

    let passwordHash = old.passwordHash || "";
    let passwordHashTrimmed = old.passwordHashTrimmed || old.passwordHash || "";

    if (enteredPassword) {
      const normalizedPassword = normalizePassword(enteredPassword);

      if (!normalizedPassword) throw new Error("Hasło nie może składać się ze spacji.");

      passwordHash = await sha256(normalizedPassword);
      passwordHashTrimmed = passwordHash;
    }

    if (!passwordHash && !passwordHashTrimmed) throw new Error("Ustaw hasło klienta.");

    const data = {
      ...old,
      title: $("#galleryTitleInput").value.trim() || slug,
      subtitle: $("#gallerySubtitleInput").value.trim(),
      passwordHash,
      passwordHashTrimmed,
      passwordVersion: 2,
      expiresAt: $("#expiresAtInput").value || "",
      maxFavorites: Number($("#maxFavoritesInput").value || 0),
      downloadsEnabled: $("#downloadsEnabledInput").checked,
      active: $("#galleryActiveInput").checked,
      photoCount: Number(old.photoCount || 0),
      photos: old.photos || {},
      coverFile: old.coverFile || "",
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
    .filter(file => /image\/jpe?g/i.test(file.type))
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

      canvas.getContext("2d", { alpha: false }).drawImage(image, 0, 0, width, height);

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

    return lastBlob;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function uploadTask(storageRef, data, contentType, onProgress) {
  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, data, {
      contentType,
      cacheControl: "public,max-age=31536000,immutable"
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
    showNotice($("#uploadStatus"), "Wybierz zdjęcia JPG.", "error");
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

      const previewBlob = await makePreview(file);
      const previewName = `${file.name}.webp`;
      const previewRef = sRef(storage, `galleries/${uploadSlug}/previews/${previewName}`);

      await uploadTask(
        previewRef,
        previewBlob,
        "image/webp",
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
        "image/jpeg",
        fraction => {
          $("#uploadProgress").style.width = `${Math.round((base + weight * (0.15 + fraction * 0.85)) * 100)}%`;
        }
      );

      await update(ref(db, `galleries/${uploadSlug}/public/photos/${manifestKey(file.name)}`), {
        filename: file.name,
        previewUrl,
        originalPath: `galleries/${uploadSlug}/originals/${file.name}`
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

async function openPhotos(slug) {
  $("#photosTitle").textContent = `Zdjęcia — ${galleries[slug]?.public?.title || slug}`;
  $("#photoManagerGrid").innerHTML = "";
  $("#photoManagerLoading").hidden = false;
  $("#photosDialog").showModal();

  try {
    const result = await listAll(sRef(storage, `galleries/${slug}/previews`));

    const items = [...result.items].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

    for (const previewRef of items) {
      const previewUrl = await getDownloadURL(previewRef);
      const originalName = previewRef.name.endsWith(".webp")
        ? previewRef.name.slice(0, -5)
        : previewRef.name;

      const item = document.createElement("article");
      item.className = "pm-item";

      item.innerHTML = `
        <div class="pm-thumb" style="background-image:url('${previewUrl}')"></div>
        <div class="pm-info">
          <div class="pm-name" title="${escapeHtml(originalName)}">${escapeHtml(originalName)}</div>
          <div class="pm-actions">
            <button type="button" class="ghost cover">Okładka</button>
            <button type="button" class="danger delete">Usuń</button>
          </div>
        </div>
      `;

      item.querySelector(".cover").addEventListener("click", async () => {
        await update(ref(db, `galleries/${slug}/public`), { coverFile: originalName });
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
    $("#photoManagerLoading").hidden = true;
  }
}

$("#closePhotosDialog").addEventListener("click", () => $("#photosDialog").close());

function downloadText(filename, content, type = "text/plain") {
  const blob = new Blob([content], { type });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function openSelections(slug) {
  const gallery = galleries[slug] || {};
  const selections = favoritesRoot?.[slug] || {};
  const container = $("#selectionContent");

  $("#selectionTitle").textContent = `${gallery.public?.title || slug} — wybrane`;
  container.innerHTML = "";

  const clients = Object.entries(selections);

  if (!clients.length) {
    container.innerHTML = '<div class="notice">Nikt nie zaznaczył jeszcze zdjęć.</div>';
  }

  clients.forEach(([clientUid, selection]) => {
    const items = Object.values(selection || {})
      .filter(item => item?.filename)
      .sort((a, b) => a.filename.localeCompare(b.filename, undefined, { numeric: true }));

    if (!items.length) return;

    const block = document.createElement("section");
    block.className = "selection-client";

    block.innerHTML = `
      <h3>Klient ${escapeHtml(clientUid.slice(0, 8))}…</h3>
      <div class="gallery-meta"><span>${items.length} zdjęć</span></div>
      <div class="selection-list">
        ${items.map(item => `<div class="selection-item">${escapeHtml(item.filename)}</div>`).join("")}
      </div>
      <div class="selection-tools">
        <button type="button" class="ghost txt">Pobierz TXT</button>
        <button type="button" class="ghost csv">Pobierz CSV</button>
      </div>
    `;

    block.querySelector(".txt").addEventListener("click", () => {
      downloadText(`${slug}-wybor.txt`, items.map(item => item.filename).join("\r\n"));
    });

    block.querySelector(".csv").addEventListener("click", () => {
      const csv = "filename\r\n" + items
        .map(item => `"${item.filename.replaceAll('"', '""')}"`)
        .join("\r\n");
      downloadText(`${slug}-wybor.csv`, csv, "text/csv");
    });

    container.appendChild(block);
  });

  $("#selectionDialog").showModal();
}

$("#closeSelectionDialog").addEventListener("click", () => $("#selectionDialog").close());