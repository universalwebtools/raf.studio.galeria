RAF.studio v10.2 — HEARTS + LOGO FIX

Co poprawione:
1. Serduszka zmieniają stan NATYCHMIAST po kliknięciu.
2. Zapis do Firebase odbywa się w tle.
3. Jeśli Firebase odrzuci zapis, serce wraca do poprzedniego stanu i pojawia się konkretny komunikat błędu.
4. Serduszka mają własny z-index 20 i nie mogą być przykryte przez zdjęcie ani skeleton.
5. Obsługa click jest przez addEventListener + preventDefault/stopPropagation.
6. Podmieniono tekstowe RAF.studio na prawdziwe logo użytkownika.
7. Dodano:
   logo-white.png
   logo-black.png
8. Na obecnym ciemnym UI używana jest wersja biała.

PODMIEŃ NA GITHUBIE:
- index.html
- admin.html
- style.css
- app.js
- logo-white.png
- logo-black.png

admin.js nie wymaga zmiany funkcjonalnej.

Reguł Firebase nie zmieniaj na tym etapie.

Jeśli po kliknięciu serca Firebase odrzuci zapis, v10.2 pokaże na ekranie dokładny kod błędu.
