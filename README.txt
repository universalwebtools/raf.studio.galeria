RAF.studio v12.1 — NO CLOUD

WARIANT BEZ GOOGLE CLOUD CONSOLE.

POBIERANIE:
- bez getBlob()
- bez fetch()
- bez ZIP
- bez CORS
- bez Google Cloud Console

↓ pojedyncze zdjęcie:
- pobiera oryginał z Firebase Storage
- korzysta z Content-Disposition: attachment

Pobierz wybrane:
- uruchamia kolejne normalne pobrania
- każde zdjęcie osobno
- Chrome może przy pierwszej próbie zapytać o zgodę na wiele pobrań

WAŻNE DLA STARYCH GALERII:
W panelu admina jest przycisk:
⚙ Napraw pobieranie

Kliknij go raz dla istniejącej galerii.
Ustawia Content-Disposition: attachment na wszystkich oryginałach.
NIE trzeba ponownie wysyłać zdjęć.

UPLOAD:
- JPG
- JPEG
- PNG
- WEBP

ADMIN LOGIN:
- zachowane poprawki v12
- Pokaż hasło
- Zapamiętaj logowanie w przeglądarce

NA GITHUBIE PODMIEŃ:
index.html
admin.html
style.css
app.js
admin.js

REGUŁ FIREBASE NIE ZMIENIAJ.
GOOGLE CLOUD CONSOLE NIE JEST POTRZEBNE.
