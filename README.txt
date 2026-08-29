RAF.studio v11.5 — PASSWORD + DOWNLOAD FIX

LOGOWANIE ADMINA:
- pola mają standardowe name=username / name=password
- autocomplete=username / current-password
- Chrome / Edge może zapisać oba pola w swoim menedżerze haseł
- dodany przycisk Pokaż hasło / Ukryj hasło
- aplikacja NIE zapisuje hasła w localStorage
- tam gdzie Chromium wspiera Credential Management API, aplikacja dodatkowo zgłasza poprawne dane menedżerowi haseł

POBIERANIE:
- klient ignoruje stare originalPath i zawsze szuka:
  galleries/{slug}/originals/{filename}
- nie używa już <a target="_blank">
- pobieranie odbywa się przez ukrytą ramkę iframe
- jeśli plik ma Content-Disposition: attachment, Chrome pobiera go bez widocznej nowej karty
- pobieranie wielu plików korzysta z wielu ukrytych ramek

STARE GALERIE:
Po pierwszym zalogowaniu do panelu v11.5 panel AUTOMATYCZNIE:
- znajduje originals
- ustawia Content-Disposition: attachment
- odbudowuje originalPath
- naprawia previewUrl
- oznacza galerię downloadMetadataVersion=2

Nie trzeba już ręcznie klikać „Napraw pobieranie”.

CO PODMIENIĆ NA GITHUBIE:
- index.html
- admin.html
- style.css
- app.js
- admin.js

REGUŁ FIREBASE NIE ZMIENIAJ.
Po aktualizacji zaloguj się raz do panelu administratora i poczekaj kilkanaście sekund,
żeby automatyczna migracja metadanych zakończyła się dla istniejących galerii.
