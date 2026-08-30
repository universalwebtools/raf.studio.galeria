RAF.studio Galeria v16.1
MANAGE FIX + HEALTH FIX + CLEAN PREVIEWS

NAPRAWIONE:
- przyciski w "Zarządzaj zdjęciami" nie są już przycinane
- przyciski są większe, w układzie 2 kolumn
- aktywne Okładka / Tło / Polecane / Ukryte mają wyraźny kolor
- kliknięcia mają obsługę błędów i natychmiastową reakcję UI
- "Zdrowie systemu" ma już poprawnie podpięte eventy
- "Uruchom pełny skan" i "Napraw bezpieczne problemy" działają

RAF.STUDIO NA STARYCH PREVIEW:
Kod v16 już NIE dodawał watermarku do nowych preview.
Napis widoczny na starych zdjęciach jest fizycznie zapisany w starych plikach WebP.

W "Zarządzaj zdjęciami" jest nowy przycisk:
♻ Przebuduj preview bez RAF.studio

Jak użyć:
1. Kliknij przycisk.
2. Wybierz lokalne oryginały zdjęć z tej galerii (możesz zaznaczyć wszystkie naraz).
3. Program tworzy nowe czyste WebP.
4. Nadpisuje TYLKO preview w Firebase.
5. Oryginałów nie wysyła ponownie.
6. Aktualizuje URL z cache-busterem, więc przeglądarka nie powinna pokazywać starego watermarku z cache.

NOWE UPLOADY:
- preview nie zawiera watermarku
- preview nie ma już cache "immutable" na rok
- URL preview dostaje wersję/cache-buster

FIREBASE:
- nie zmieniaj Realtime Database Rules z v16
- nie zmieniaj Storage Rules

PACZKA:
- zawiera tylko jeden README: README-v16.1.txt
