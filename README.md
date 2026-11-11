# RAF.studio — Galeria klienta

Frontend (GitHub Pages, `galeria.raf-studio.pl`) + Firebase (`rafstudiogaleria`):
Realtime Database, Storage, Auth (admin e-mail + anonimowi klienci), Cloud Functions.

## Pliki strony klienta

| Plik | Co robi |
|---|---|
| `index.html`, `gallery.js`, `gallery.css` | Galeria klienta: hasło, okładka, wybór ♥, uwagi do zdjęć, zatwierdzenie, filmy, pokaz slajdów, ZIP |
| `zip.js` | Tworzenie paczki ZIP w przeglądarce |
| `home.html`, `home.js` | Strefa klienta — wejście po kodzie galerii (bez publicznej listy galerii) |
| `fonts/` | Font Inter (jak na raf-studio.pl) |
| `admin-client-extras.js` | Panel: ustawienia Strefy klienta (opinia Google, kontakt) i filmy w galerii |

Wygląd jest spójny z raf-studio.pl: jasny motyw, Inter, złoty akcent. Klient może przełączyć
motyw na ciemny (zapamiętywane w jego przeglądarce).

Dane: uwagi do zdjęć są w `selections/{slug}/{key}/note` i w zatwierdzeniu
(`approvals/.../filenames/{key}/note`), filmy w `galleries/{slug}/public/videos`,
link do opinii w `galleries/__system__/public/clientZoneConfig/googleReviewUrl`.

## Ochrona galerii hasłem

Hasło klienta jest sprawdzane **tylko na serwerze**, w Cloud Function
`galleryAccess` (`functions/index.js`, region `europe-west1`):

1. Klient loguje się anonimowo i wywołuje `galleryAccess({ action: "unlock", slug, password })`.
2. Po poprawnym haśle funkcja zapisuje `access/{uid}/{slug}` i dopisuje slug do
   custom claim `g` w tokenie klienta.
3. Reguły Database (`database-rules.json`) wpuszczają do `galleries/{slug}/public`,
   `selections`, `approvals` i `clientAnalytics` tylko z wpisem w `access`.
   Reguły Storage (`storage.rules`) wpuszczają do plików tylko z claimem `g`.

Limit prób: 10 na urządzenie i 60 łącznie na galerię w ciągu 15 minut.
`action: "info"` zwraca tylko status i tytuł galerii do ekranu logowania.

## Wdrożenie (kolejność ma znaczenie)

```bash
firebase deploy --only functions --project rafstudiogaleria
```

Potem wypchnij frontend na GitHub (`main`), a na końcu reguły:

```bash
firebase deploy --only database,storage --project rafstudiogaleria
```

Reguły na końcu, bo blokują starą wersję frontendu. Po wdrożeniu klienci
z otwartą galerią muszą raz ponownie wpisać hasło.

## Uwaga: stare linki do zdjęć

Pole `previewUrl` to link Storage z tokenem pobierania — działa niezależnie od
reguł. Linki, które były publicznie czytelne przed tą zmianą, pozostają ważne,
dopóki nie unieważnisz tokenów (Firebase Console → Storage → plik → „Revoke”)
albo nie wgrasz zdjęć ponownie.
