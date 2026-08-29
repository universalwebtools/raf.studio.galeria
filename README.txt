RAF.studio v12.3 — LOGIN + DOWNLOAD STABLE

LOGOWANIE ADMINA:
- Chrome password popup nie jest już podstawą działania
- formularz ma autocomplete=off
- checkbox: Zapamiętaj dane na tym urządzeniu
- po zaznaczeniu aplikacja zapisuje email + hasło w localStorage TEJ PRZEGLĄDARKI
- po następnym wejściu oba pola są automatycznie wypełnione
- Pokaż hasło jest osobnym linkiem POD polami, więc popup Chrome go nie zasłania
- kliknięcie zmienia password <-> text

UWAGA:
Zapis hasła w localStorage jest wygodny, ale mniej bezpieczny niż systemowy menedżer haseł.
Używaj tego tylko na swoim prywatnym komputerze.

POBIERANIE:
Kolejność:
1. originalPath z manifestu
2. galleries/{slug}/originals/{filename}
3. preview

Jeśli oryginału naprawdę nie ma, klient dostanie preview zamiast błędu.

Panel -> ⚙ Napraw pobieranie:
- ustawia Content-Disposition: attachment dla ORIGINALS
- ustawia Content-Disposition: attachment również dla PREVIEWS
- dzięki temu fallback preview też pobiera się zamiast otwierać w nowej karcie

CO ZROBIĆ:
1. GitHub — podmień:
   admin.html
   admin.js
   index.html
   app.js
   style.css

2. Nie zmieniaj reguł Firebase.

3. Przy istniejącej galerii kliknij raz:
   ⚙ Napraw pobieranie

4. Ctrl+F5.

Pobierania masowego nadal są bez ZIP i bez Google Cloud Console.
