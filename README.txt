RAF.studio v5 — poprawiony panel admina

PODMIEŃ NA GITHUBIE:
- admin.html
- admin.js
- style.css
- firebase-config.js

index.html i app.js z v4 mogą zostać.

WAŻNE:
1. Realtime Database -> Rules -> wklej database-rules.json -> Publish
2. Storage -> Rules -> wklej storage-rules.txt -> Publish

NOWOŚCI:
- po Zapisz dostajesz komunikat sukcesu albo dokładny błąd Firebase
- każda galeria pokazuje gotowy link + przycisk Kopiuj
- przycisk + Zdjęcia w każdej galerii
- wybierasz wiele JPG naraz
- oryginał trafia do originals/
- podgląd max 2200 px jest automatycznie generowany w przeglądarce i trafia do previews/
- pasek postępu
- licznik zdjęć w panelu
- naprawione [hidden], więc ekran logowania nie świeci w tle
