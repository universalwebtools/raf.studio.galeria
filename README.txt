RAF.studio v12.2 — LOGIN FIX

ZNALEZIONY BŁĄD:
admin.js miał:
updateMetadata, updateMetadata

Duplikat importu powodował, że cały moduł administratora nie uruchamiał się w przeglądarce.

SKUTKI BYŁY DOKŁADNIE TAKIE:
- Pokaż hasło nie działało
- event logowania nie działał
- formularz wysyłał się natywnie
- username/password trafiały do URL

NAPRAWIONE:
- usunięty duplikat importu
- formularz ma action=javascript:void(0), więc nawet przy awarii JS nie wyśle hasła w URL
- Pokaż hasło ma też prosty inline fallback i działa nawet gdy admin.js jeszcze się ładuje
- standardowe autocomplete=username / current-password
- aplikacja pamięta tylko email
- hasła NIE zapisujemy ręcznie w localStorage
- Chrome/Edge może normalnie zapisać hasło swoim natywnym menedżerem
- usunięty checkbox i niestabilne PasswordCredential API

POBIERANIA, SERDUSZEK, UPLOADU JPG/PNG/WEBP NIE ZMIENIANO.

NA GITHUBIE PODMIEŃ:
admin.html
admin.js
index.html
app.js
style.css

REGUŁ FIREBASE NIE ZMIENIAJ.
