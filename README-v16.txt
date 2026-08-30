RAF.studio Galeria v16 — WORKFLOW + FEATURED + HIDDEN + APPROVAL + HEALTH + HERO

NAJWAŻNIEJSZE NOWOŚCI

1. ⭐ POLECANE PRZEZ FOTOGRAFA
   Panel admina -> Zarządzaj -> przy zdjęciu „☆ Polecane”.
   Klient zobaczy małą złotą etykietę „★ Polecane”.

2. 🙈 UKRYTE TYLKO DLA FOTOGRAFA
   Panel admina -> Zarządzaj -> „Ukryj klientowi”.
   Plik NIE jest kasowany z Firebase. Manifest zdjęcia jest przenoszony do admin-only `privatePhotos`, więc klient nie dostaje nawet jego URL z publicznego manifestu.

3. ♡ WYCZYŚĆ SERDUSZKA
   Klient jednym kliknięciem może wyzerować cały swój aktualny wybór i zacząć od nowa.

4. ✓ ZATWIERDŹ SWOJE WYBORY DO OBRÓBKI
   Klient zatwierdza aktualny zestaw serduszek.
   Firebase zapisuje:
   - datę i godzinę,
   - liczbę zdjęć,
   - pełną listę nazw zdjęć.
   Kolejne zatwierdzenie NIE kasuje starego — powstaje historia.
   Panel admina -> ♥ Wybory pokazuje cały LOG zatwierdzeń.

5. 🩺 ZDROWIE SYSTEMU
   Sprawdza:
   - Firebase Auth,
   - Realtime Database,
   - Firebase Storage,
   - błędne liczniki photoCount,
   - brakujące preview,
   - brakujące oryginały,
   - nieprawidłowe manifesty,
   - osierocone foldery Storage.
   „Napraw bezpieczne problemy” naprawia liczniki i brakujące canonical originalPath.

6. TŁO / HERO GALERII
   - osobne zdjęcie „Tło”, niezależne od okładki,
   - tryb Cover,
   - tryb Stała szerokość (dobry na bardzo szerokie monitory),
   - tryb Contain (całe zdjęcie),
   - możliwość wyłączenia zdjęcia w tle,
   - regulowana wysokość desktop / telefon,
   - regulowana szerokość obrazu w trybie stałym,
   - kolor tła obok zdjęcia,
   - pozycja X/Y.

7. WATERMARK RAF.STUDIO USUNIĘTY Z GENERATORA PREVIEW
   NOWE i ponownie wgrane preview nie mają watermarku.

WAŻNE DLA JUŻ ISTNIEJĄCYCH PREVIEW Z WATERMARKIEM
Watermark został fizycznie wypalony w starych plikach WebP podczas wcześniejszego uploadu.
Kod strony nie może go „odrysować” z istniejącego WebP. Aby usunąć go ze starej galerii bez zmiany nazw i bez utraty serduszek,
wgraj ponownie te same oryginalne zdjęcia o tych samych nazwach. Preview zostaną nadpisane już BEZ watermarku,
a wybory klienta pozostaną, bo są zapisane według nazw plików.

FIREBASE RULES
v16 dodaje nową gałąź approvals/{galleryId} dla logu zatwierdzeń klienta.
W Firebase -> Realtime Database -> Rules wklej CAŁĄ zawartość database-rules.json z tej paczki i kliknij Publish.
Storage Rules bez zmian.

README
Od v15.4 każda paczka zawiera tylko jeden, najnowszy README.
