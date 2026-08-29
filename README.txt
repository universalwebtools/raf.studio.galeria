RAF.studio v11.2 — FAVORITES FIX

Dlaczego:
Stare ulubione były pod:
galleries/{slug}/selections/{uid}

v11.2 przenosi je do osobnej, prostszej gałęzi:
favorites/{slug}/{uid}/{photoKey}

Dzięki temu reguły klienta nie mieszają się z administracyjnymi regułami galerii.

KRYTYCZNIE WAŻNE:
Firebase -> Realtime Database -> Rules
1. usuń obecne reguły
2. wklej CAŁY database-rules.json z tej paczki
3. kliknij Publish

Bez kroku 3 Firebase nadal będzie zwracał PERMISSION_DENIED.

NA GITHUBIE PODMIEŃ:
- index.html
- admin.html
- app.js
- admin.js
- style.css

Reguł Storage nie zmieniaj.

Po zmianie:
- serce robi się czerwone
- wybór zapisuje się w /favorites
- po odświeżeniu serce nadal jest zaznaczone
- panel admina -> Wybory pokazuje pliki klienta
- usunięcie galerii usuwa również jej favorites
