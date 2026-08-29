RAF.studio GALERIA — ULTRA PRO v8

DLA FOTOGRAFA:
- dashboard: galerie, zdjęcia, wybory i zatwierdzone wybory
- tworzenie/edycja galerii
- hasło, slug, opis, termin wygaśnięcia
- limit ulubionych, pobieranie, aktywność, blokada po zatwierdzeniu
- upload wielu JPG + prawdziwy pasek postępu
- automatyczne podglądy 1800 px
- pełne oryginały osobno
- automatyczna okładka
- zarządzanie zdjęciami: okładka, usuwanie
- gotowy link klienta
- wybory klientów z imieniem i notatką
- status Roboczy / Zatwierdzony
- eksport nazw plików TXT i CSV
- wyszukiwanie i filtrowanie galerii

DLA KLIENTA:
- elegancki ekran hasła
- duża okładka sesji
- responsywny masonry grid
- lightbox + klawiatura + swipe
- ulubione synchronizowane z Firebase
- limit wyboru i pasek postępu
- filtr wybranych
- pobieranie oryginału (jeżeli włączone)
- Zatwierdź wybór + imię + wiadomość
- możliwość blokady wyboru po zatwierdzeniu
- udostępnianie linku

INSTALACJA:
1. Na GitHubie podmień:
   index.html
   admin.html
   style.css
   app.js
   admin.js
   firebase-config.js
2. Firebase Realtime Database -> Rules:
   wklej database-rules.json -> Publish.
3. Firebase Storage -> Rules:
   wklej storage-rules.txt -> Publish.
4. Panel:
   https://universalwebtools.github.io/raf.studio.galeria/admin.html

UWAGA DOT. HASŁA:
Hasło galerii jest zapisane jako hash SHA-256. To jest lepsze niż jawne hasło w JS,
ale pełne bezpieczeństwo klasy komercyjnych galerii wymaga później walidacji hasła
po stronie serwera (np. Firebase Cloud Function).