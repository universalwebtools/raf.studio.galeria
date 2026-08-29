RAF.studio v10 INSTANT

NAJWAŻNIEJSZA ZMIANA:
Klient NIE skanuje już Firebase Storage przy każdym wejściu.

Podczas uploadu panel zapisuje gotowy manifest:
galleries/{slug}/public/photos

Każdy wpis zawiera:
- filename
- previewUrl
- originalPath

Efekt:
- wejście klienta = jeden odczyt Realtime Database
- miniatury zaczynają się ładować natychmiast
- zero listAll() po stronie klienta
- zero getDownloadURL() dla previews po stronie klienta
- oryginał pobierany dopiero po kliknięciu zdjęcia

DLA STARYCH GALERII:
W panelu przy galerii kliknij:
⚡ Odbuduj indeks

Panel jednorazowo przeskanuje previews i zapisze manifest.
Potem klient ładuje galerię błyskawicznie.

NOWE UPLOADY:
Manifest tworzy się automatycznie podczas wysyłania każdego zdjęcia.

PODMIEŃ:
index.html
admin.html
style.css
app.js
admin.js

REGUŁ FIREBASE NIE TRZEBA ZMIENIAĆ.
