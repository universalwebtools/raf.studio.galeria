
RAF.studio Galeria v14.2 — SELECTION LIMIT FIX

NAPRAWIONO:
- liczba wybranych nigdy nie może być większa niż liczba aktualnych zdjęć
- liczba wybranych nigdy nie może być większa niż ustawiony limit galerii
- stare/usunięte zdjęcia nie są liczone
- duplikaty .jpg/.webp/.png o tej samej nazwie bazowej są traktowane jako jedno zdjęcie
- panel admina po wejściu w ♥ Wybory automatycznie czyści stare anonimowe klienty i zostawia tylko jeden shared selection
- klient również filtruje stare śmieci od razu po wczytaniu

DLA GALERII 26 ZDJĘĆ + LIMIT 20:
Maksymalny poprawny licznik to 20.

Po wrzuceniu plików na GitHub:
1. Ctrl+F5 / odśwież stronę
2. Otwórz raz ♥ Wybory w panelu admina — to fizycznie posprząta stare dane w Firebase.

Reguł Firebase nie trzeba zmieniać względem v14.1.
