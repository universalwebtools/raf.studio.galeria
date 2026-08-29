(() => {
  const cfg = window.GALLERY_CONFIG;
  const $ = (s) => document.querySelector(s);
  const lock = $("#lockScreen");
  const view = $("#galleryView");
  const grid = $("#grid");
  const favCount = $("#favCount");
  const selectedCount = $("#selectedCount");
  const photoCount = $("#photoCount");
  const favoritesToggle = $("#favoritesToggle");
  let onlyFavorites = false;
  let currentIndex = 0;

  const storageKey = `raf-favorites-${cfg.id}`;
  let favorites = new Set(JSON.parse(localStorage.getItem(storageKey) || "[]"));

  $("#lockTitle").textContent = cfg.title;
  $("#galleryName").textContent = cfg.title;
  $("#heroTitle").textContent = cfg.title;
  $("#heroSubtitle").textContent = cfg.subtitle;
  photoCount.textContent = cfg.photos.length;

  function saveFavs() {
    localStorage.setItem(storageKey, JSON.stringify([...favorites]));
    favCount.textContent = favorites.size;
    selectedCount.textContent = favorites.size;
  }

  function render() {
    const photos = onlyFavorites ? cfg.photos.filter(p => favorites.has(p.id)) : cfg.photos;
    grid.innerHTML = "";
    if (!photos.length) {
      grid.innerHTML = `<div class="empty">Nie masz jeszcze wybranych ulubionych zdjęć.</div>`;
      return;
    }
    photos.forEach(photo => {
      const originalIndex = cfg.photos.findIndex(p => p.id === photo.id);
      const card = document.createElement("article");
      card.className = "photo-card";
      card.innerHTML = `
        <img loading="lazy" src="${photo.preview}" alt="${photo.filename}">
        <button class="fav-btn ${favorites.has(photo.id) ? "active" : ""}" aria-label="Ulubione">${favorites.has(photo.id) ? "♥" : "♡"}</button>
      `;
      card.querySelector("img").addEventListener("click", () => openLightbox(originalIndex));
      card.querySelector(".fav-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        toggleFavorite(photo.id);
      });
      grid.appendChild(card);
    });
  }

  function toggleFavorite(id) {
    favorites.has(id) ? favorites.delete(id) : favorites.add(id);
    saveFavs();
    render();
    if (!$("#lightbox").hidden) updateLightbox();
  }

  function openLightbox(index) {
    currentIndex = index;
    $("#lightbox").hidden = false;
    document.body.style.overflow = "hidden";
    updateLightbox();
  }

  function updateLightbox() {
    const p = cfg.photos[currentIndex];
    $("#lightboxImage").src = p.full;
    $("#lightboxImage").alt = p.filename;
    $("#lightboxCaption").textContent = `${currentIndex + 1} / ${cfg.photos.length} · ${p.filename}`;
    $("#lightboxDownload").href = p.full;
    $("#lightboxDownload").download = p.filename;
    $("#lightboxFav").textContent = favorites.has(p.id) ? "♥ Ulubione" : "♡ Ulubione";
  }

  function closeLightbox() {
    $("#lightbox").hidden = true;
    document.body.style.overflow = "";
  }

  $("#passwordForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const ok = $("#passwordInput").value === cfg.password;
    $("#passwordError").hidden = ok;
    if (ok) {
      sessionStorage.setItem(`raf-access-${cfg.id}`, "1");
      lock.hidden = true;
      view.hidden = false;
      render();
    }
  });

  $("#logoutBtn").addEventListener("click", () => {
    sessionStorage.removeItem(`raf-access-${cfg.id}`);
    location.reload();
  });

  favoritesToggle.addEventListener("click", () => {
    onlyFavorites = !onlyFavorites;
    favoritesToggle.innerHTML = `${onlyFavorites ? "♥ Wszystkie" : "♡ Ulubione"} <span id="favCount">${favorites.size}</span>`;
    render();
  });

  $("#closeLightbox").addEventListener("click", closeLightbox);
  $("#prevPhoto").addEventListener("click", () => { currentIndex = (currentIndex - 1 + cfg.photos.length) % cfg.photos.length; updateLightbox(); });
  $("#nextPhoto").addEventListener("click", () => { currentIndex = (currentIndex + 1) % cfg.photos.length; updateLightbox(); });
  $("#lightboxFav").addEventListener("click", () => toggleFavorite(cfg.photos[currentIndex].id));

  document.addEventListener("keydown", (e) => {
    if ($("#lightbox").hidden) return;
    if (e.key === "Escape") closeLightbox();
    if (e.key === "ArrowLeft") $("#prevPhoto").click();
    if (e.key === "ArrowRight") $("#nextPhoto").click();
  });

  saveFavs();
  if (sessionStorage.getItem(`raf-access-${cfg.id}`) === "1") {
    lock.hidden = true;
    view.hidden = false;
    render();
  }
})();