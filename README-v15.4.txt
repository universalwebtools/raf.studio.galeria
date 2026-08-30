RAF.studio Galeria v15.4
CLIENT LOGIN + ADMIN LAYOUT + ORPHAN STORAGE CLEANUP

NOWOŚCI:
1. W paczce jest tylko TEN JEDEN README.
   Stare README-v13 / v14 / v15.x nie są już kopiowane.

2. 🔑 LOGOWANIE KLIENTA
   Nowy globalny konfigurator ekranu, na którym klient wpisuje hasło galerii:
   - tekst nad tytułem
   - instrukcja
   - placeholder hasła
   - tekst przycisku
   - rozmiar logo
   - szerokość / padding / zaokrąglenie karty
   - rozmiar tytułu
   - kolory tła / karty / pól / przycisku
   - włącz/wyłącz logo, mały napis i instrukcję
   - podgląd na żywo

3. 🖥 WYGLĄD PANELU ADMINA
   Panel jest domyślnie bardziej zwarty i mniej rozciągnięty.
   Możesz zmieniać:
   - maksymalną szerokość treści
   - padding
   - odstępy sekcji
   - zaokrąglenia
   - padding kart
   - 1 / 2 / 3 kolumny galerii
   - zwarty Storage Monitor
   - zwarty pasek statystyk
   - kolory panelu

4. TEST-SESSION / OSIEROCONE STORAGE
   Storage Monitor wykrywa foldery, które istnieją w Firebase Storage,
   ale nie mają już galerii w bazie.
   Przy takim wpisie pojawia się czerwony przycisk:
   "Usuń ze Storage"

   Przy test-session kliknij ten przycisk RAZ.
   Program usunie:
   galleries/test-session/...
   i automatycznie przeliczy Storage Monitor.

WAŻNE:
- ChatGPT nie ma bezpośredniego dostępu do Twojego Firebase Storage,
  więc nie może zdalnie skasować test-session z tej rozmowy.
  v15.4 dodaje działający przycisk kasowania bezpośrednio w Twoim panelu admina.
- Nie trzeba zmieniać Realtime Database Rules.
- Nie trzeba zmieniać Storage Rules.
- Po wrzuceniu plików na GitHub zrób Ctrl+F5.
