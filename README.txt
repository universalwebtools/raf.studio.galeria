RAF.studio v9 FAST WEBP

NAJWAŻNIEJSZA ZMIANA:
v8 NIE używała WebP. Podglądy były JPEG 1800 px.
Dodatkowo klient przed pokazaniem galerii pobierał URL każdego preview ORAZ każdego oryginału.

v9:
- nowe podglądy są WebP
- max 1600 px, adaptacyjna kompresja
- cel: zwykle poniżej ok. 650 KB na preview
- klient na wejściu pobiera WYŁĄCZNIE adresy preview
- oryginał jest pobierany dopiero po kliknięciu konkretnego zdjęcia
- kafelki pojawiają się od razu jako skeletony
- adresy preview są pobierane progresywnie (6 równolegle)
- stare galerie z JPG preview nadal działają
- nowe preview mają nazwę np. IMG_001.jpg.webp
- original zachowuje IMG_001.jpg

PODMIEŃ NA GITHUBIE:
index.html
admin.html
style.css
app.js
admin.js

REGUŁ FIREBASE NIE ZMIENIAJ.

WAŻNE:
Stare galerie nie staną się automatycznie WebP. Żeby skorzystać z pełnego przyspieszenia,
najlepiej w nowej galerii wrzucić zdjęcia ponownie przez panel v9.
