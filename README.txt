RAF.studio v10.1 — SKELETON FIX

Problem:
Załadowane zdjęcia były przykrywane przez animowany skeleton.
Na hover transform zdjęcia zmieniał stacking context i zdjęcie pojawiało się tylko pod kursorem.

Naprawa:
- skeleton ma z-index 0
- zdjęcie ma z-index 1
- serduszko ma z-index 3
- po onload karta dostaje klasę is-loaded
- skeleton znika na stałe po załadowaniu
- obsługa zdjęć już znajdujących się w cache

PODMIEŃ NA GITHUBIE:
- style.css
- app.js
- index.html (tylko dla cache-bustingu ?v=10.1)

admin.html/admin.js nie wymagają zmian funkcjonalnych.
Reguł Firebase nie zmieniaj.
