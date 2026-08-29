RAF.studio v11.1 — LOGIN + LOGO FIX

Naprawione:
- logo ma stałą SZEROKOŚĆ zamiast wysokości i nie rozjeżdża layoutu
- nowe galerie zapisują hash hasła po trim()
- klient sprawdza zarówno nowy hash trim(), jak i starszy hash
- przypadkowa spacja na początku/końcu hasła nie psuje logowania
- po poprawnym haśle galeria otwiera się NATYCHMIAST
- odczyt ulubionych odbywa się w tle i nie może już wyglądać jak błąd hasła
- błędne hasło = tylko „Nieprawidłowe hasło”
- błąd Firebase = pokazany jako osobny „Błąd logowania: ...”
- app.js i admin.js sprawdzone składniowo przez Node

NA GITHUBIE PODMIEŃ:
index.html
admin.html
style.css
app.js
admin.js

Reguł Firebase NIE trzeba zmieniać względem v11.

WAŻNE:
Jeżeli edytujesz starą galerię i chcesz mieć 100% pewności co do hasła,
wejdź Ustawienia -> wpisz hasło jeszcze raz -> Zapisz.
Nowe galerie v11.1 zapisują je już w nowym, stabilnym formacie.
