RAF.studio Galeria v15.3 — LOGIN EDITOR

NOWOŚCI:
- logo panelu administratora jest na sztywno idealnie wyśrodkowane
- nowy przycisk: 🔐 Ustawienia logowania
- pełny edytor ekranu logowania administratora
- podgląd na żywo
- konfiguracja jest GLOBALNA, nie per galeria
- zapis konfiguracji w Firebase
- konfiguracja działa również na innym urządzeniu / przeglądarce

MOŻNA ZMIENIAĆ:
- tytuł, opis, eyebrow
- tekst przycisku logowania
- placeholder e-mail / hasło
- tekst Zapamiętaj dane
- tekst Pokaż hasło / Ukryj hasło
- rozmiar logo
- szerokość / padding / zaokrąglenie karty
- rozmiar tytułu
- odstępy formularza
- 3 kolory tła
- kolor karty / ramki / tekstów
- kolor pól
- kolor przycisku
- włącz / wyłącz logo
- włącz / wyłącz mały napis
- włącz / wyłącz opis
- włącz / wyłącz zapamiętanie danych
- włącz / wyłącz Pokaż hasło

TECHNICZNIE:
Konfiguracja jest zapisywana pod:
galleries/__system__/public/adminLoginConfig

Ekran logowania używa logowania anonimowego wyłącznie do odczytania publicznej konfiguracji wyglądu.
Nie trzeba zmieniać Realtime Database Rules v15.0.1.
Nie trzeba zmieniać Storage Rules.

Na GitHub podmień pliki z ZIP-a i zrób Ctrl+F5.
