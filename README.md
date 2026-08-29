# RAF.studio Client Gallery

Pierwsza wersja galerii klienta przygotowana do publikacji przez GitHub Pages.

## Co już działa
- ekran wejścia z hasłem,
- responsywny układ mobile-first,
- galeria typu masonry,
- pełnoekranowy podgląd,
- przewijanie zdjęć,
- ulubione zapamiętywane w przeglądarce,
- filtr ulubionych,
- pobieranie pojedynczego zdjęcia,
- lazy loading podglądów.

## Ważne: bezpieczeństwo wersji demo
Hasło w `gallery-config.js` chroni tylko interfejs. Nie jest to jeszcze prawdziwa ochrona plików przed osobą techniczną, która zna narzędzia deweloperskie lub bezpośredni URL obrazu.

Docelowy etap:
1. GitHub Pages = frontend.
2. Firebase / backend = konta galerii, sesje i autoryzacja.
3. Storage = podglądy i oryginały poza GitHubem.
4. Reguły/backend = klient otrzymuje dostęp wyłącznie do swojej galerii.
5. Panel fotografa = tworzenie galerii, hasło, upload zdjęć, termin ważności, eksport zaznaczeń.

## Test
Otwórz `index.html`.
Hasło demo: `raf123`

## Publikacja GitHub Pages
1. Utwórz nowe publiczne repo, np. `raf-client-gallery`.
2. Wgraj zawartość tego folderu do głównego katalogu repo.
3. Settings -> Pages.
4. Source: Deploy from a branch.
5. Branch: `main`, folder `/ (root)`.
6. Zapisz.

## Następny krok
Nie wrzucaj docelowych 300 MB / 1 GB zdjęć do tego repo.
Podłączymy magazyn plików i bezpieczny dostęp klienta.
