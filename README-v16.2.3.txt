RAF.studio Galeria v16.2.3 — PIXEL PERFECT HERO PREVIEW

NAPRAWIONE:
- podgląd HERO nie używa już przypadkowego aspect-ratio 16:5 / 4:2.2 / 9:12
- podgląd tworzy prawdziwy wirtualny HERO w tych samych wymiarach co galeria i skaluje go w całości
- cover / contain kadruje zdjęcia identycznie
- gap i radius są liczone w tych samych pikselach
- główne zdjęcie używa tej samej pozycji X/Y co prawdziwa galeria
- przyciemnienie używa identycznego gradientu

BRAK CZARNYCH PUSTYCH PÓL:
- właściwy kolaż ma ustawioną szerokość HERO
- boki są automatycznie wypełniane rozmytym ambientem z głównego zdjęcia
- dzięki temu nie trzeba rozciągać głównych zdjęć na cały monitor

SUWAKI:
Dodane pod polami liczbowymi:
- maksymalna szerokość HERO
- wysokość komputer
- wysokość tablet
- wysokość telefon
- odstęp kafli
- zaokrąglenie kafli
- przyciemnienie

Pole liczbowe i suwak są zsynchronizowane.
Jeśli wpiszesz wartość spoza zakresu, po zatwierdzeniu zostanie automatycznie ograniczona do dozwolonego zakresu.

Nie zmieniaj Firebase Rules ani Storage Rules.
