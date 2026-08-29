RAF.studio v10.3 — RED HEARTS + PERMISSION FIX

ZMIANY:
- usunięty cały dolny pasek „Zatwierdź wybór”
- usunięte okna finalizacji wyboru
- klient po prostu klika serduszka
- wybór zapisuje się automatycznie do Firebase
- aktywne serce jest CZERWONE
- licznik Wybrano X / LIMIT zostaje
- filtr „Wybrane” zostaje
- prawdziwe logo RAF.studio zostaje
- poprawione Realtime Database Rules dla anonimowego klienta

WAŻNE:
Realtime Database -> Rules
MUSISZ wkleić database-rules.json z tej paczki i kliknąć Publish.
To naprawia PERMISSION_DENIED przy serduszkach.

Storage Rules nie wymagają zmiany, ale aktualna wersja jest również w paczce.

NA GITHUBIE PODMIEŃ:
- index.html
- admin.html
- style.css
- app.js
- logo-white.png
- logo-black.png

admin.js może zostać obecny.

FIREBASE:
Realtime Database -> Rules -> database-rules.json -> Publish.
