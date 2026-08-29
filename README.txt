RAF.studio v11.4 — STABLE DOWNLOADS

NAPRAWIONE:
1. Serduszka:
   - przy każdym odczycie/zapisie używany jest aktualny auth.currentUser.uid
   - nie ma już ryzyka zapisu pod stary UID

2. Pobieranie jednego zdjęcia:
   - usunięty fetch(), który powodował CORS / Failed to fetch
   - upload ustawia Content-Disposition: attachment
   - kliknięcie ↓ korzysta z natywnego pobierania przeglądarki

3. Pobierz wybrane:
   - usunięty ZIP w przeglądarce
   - brak JSZip
   - brak cross-origin fetch
   - zdjęcia są uruchamiane jako osobne pobrania
   - Chrome może za pierwszym razem poprosić o zgodę na wiele pobrań

4. STARE GALERIE:
   - przy galerii w panelu jest przycisk:
     ⚙ Napraw pobieranie
   - ustawia poprawne Content-Disposition
   - naprawia originalPath
   - odświeża previewUrl/manifest
   - NIE trzeba ponownie wysyłać zdjęć

CO ZROBIĆ:
A) GitHub — podmień:
   index.html
   admin.html
   app.js
   admin.js
   style.css

B) Firebase Realtime Database -> Rules:
   wklej database-rules.json z tej paczki -> Publish.

C) Dla obecnej galerii:
   Panel admina -> ⚙ Napraw pobieranie
   poczekaj aż skończy.

Reguł Storage nie trzeba zmieniać.
