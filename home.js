// Strefa klienta: przejście do galerii po kodzie lub wklejonym linku.
// Celowo bez listy galerii — nazwy galerii klientów nie są publiczne.
(function () {
  var THEME_KEY = "raf-gallery-theme";

  function setTheme(dark) {
    if (dark) document.documentElement.dataset.theme = "dark";
    else delete document.documentElement.dataset.theme;
    document.querySelectorAll(".theme-toggle use").forEach(function (use) {
      use.setAttribute("href", dark ? "#i-sun" : "#i-moon");
    });
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", dark ? "#0b0b0c" : "#ffffff");
  }

  setTheme(document.documentElement.dataset.theme === "dark");
  document.querySelectorAll(".theme-toggle").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var dark = document.documentElement.dataset.theme !== "dark";
      try { localStorage.setItem(THEME_KEY, dark ? "dark" : "light"); } catch (_) {}
      setTheme(dark);
    });
  });

  function codeFrom(value) {
    var text = String(value || "").trim();
    if (!text) return "";
    // Wklejony link do galerii.
    try {
      var url = new URL(text, location.href);
      var fromLink = url.searchParams.get("g");
      if (fromLink) return fromLink.trim();
    } catch (_) {}
    return text.toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/ł/g, "l")
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  var form = document.getElementById("codeForm");
  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var code = codeFrom(document.getElementById("codeInput").value);
    var error = document.getElementById("codeError");
    if (!code) { error.hidden = false; return; }
    error.hidden = true;
    location.href = "index.html?g=" + encodeURIComponent(code);
  });
})();
