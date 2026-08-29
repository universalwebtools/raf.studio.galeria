# RAF.studio Client Gallery v2

## Firebase Storage
Ta wersja pobiera zdjęcia z:
`galleries/test-session/previews/`

Hasło testowe: `raf123`

## Reguły TESTOWE
Firebase Storage -> Rules:

```txt
rules_version = '2';

service firebase.storage {
  match /b/{bucket}/o {
    match /galleries/test-session/{allPaths=**} {
      allow read: if true;
      allow write: if false;
    }

    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

Kliknij Publish.

To pozwala tylko na odczyt plików z testowej galerii. Zapis pozostaje zablokowany.
To jeszcze nie jest docelowa ochrona hasłem.

## GitHub
Zastąp:
- index.html
- style.css
- app.js

Dodaj:
- firebase-config.js

Stary `gallery-config.js` możesz usunąć.
