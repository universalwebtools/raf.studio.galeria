RAF.studio GALERIA v11 STABLE

Ta wersja jest przebudowana od zera po wykryciu uszkodzonego index.html.

NAJWAŻNIEJSZE:
- naprawione logowanie klienta
- naprawione serduszka / zapis automatyczny
- czerwone serca
- brak „Zatwierdź wybór”
- szybki manifest zdjęć w Realtime Database
- poprawny lightbox
- poprawne logo RAF.studio
- pełne usuwanie galerii: Storage + Realtime Database
- usuwanie pojedynczych zdjęć
- komunikaty błędów zamiast „nic się nie dzieje”
- eksport wyborów klienta TXT/CSV
- sprawdzony składniowo app.js i admin.js

KRYTYCZNIE WAŻNE:
W Firebase -> Realtime Database -> Rules
wklej database-rules.json z tej paczki i kliknij Publish.

Reguła .write na poziomie $galleryId daje adminowi prawo do usuwania całej galerii.
Reguła na selections/$clientUid daje klientowi anonimowemu prawo wyłącznie do własnych serduszek.

NA GITHUBIE PODMIEŃ:
index.html
admin.html
style.css
app.js
admin.js
firebase-config.js

logo-white.png / logo-black.png zostają takie same, ale są też w paczce.
