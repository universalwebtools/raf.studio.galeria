RAF.studio Galeria v15 — SITE EDITOR + STICKY A/B + SELECTION FIX

NAJWAŻNIEJSZE:
1. Serduszka przeniesione do nowej czystej gałęzi Realtime Database: selections/{slug}.
2. Pasek A/B jest FIXED przy dole ekranu i jedzie razem ze scrollem.
3. Każda galeria ma przycisk „🎨 Ustawienia strony”.
4. W edytorze można zmieniać:
   - liczbę kolumn na komputerze / tablecie / telefonie,
   - odstęp i zaokrąglenie zdjęć,
   - rozmiar i odstęp przycisków,
   - kolor zwykłych przycisków,
   - kolor aktywnego serduszka,
   - kolor aktywnego A/B,
   - kolor aktywnego zaznaczenia do pobrania,
   - kolor aktywnego filtra,
   - widoczność nazw zdjęć,
   - nazwy filtrów i głównych przycisków.
5. Ustawienia są osobne dla każdej galerii i zapisują się w Firebase w uiConfig.
6. Stare favorites są tylko migrowane przez panel admina do selections i potem usuwane.

BARDZO WAŻNE — FIREBASE:
Wersja v15 wymaga jednorazowego podmienienia Realtime Database Rules.
Wklej CAŁĄ zawartość database-rules.json z paczki do:
Firebase -> Realtime Database -> Rules -> Publish.

Storage Rules NIE zmieniaj.
Google Cloud NIE jest potrzebny.

Po aktualizacji:
- wrzuć pliki na GitHub,
- opublikuj database-rules.json w Firebase,
- Ctrl+F5,
- wejdź raz w ♥ Wybory w panelu admina, aby zmigrować stare wybory do selections.
