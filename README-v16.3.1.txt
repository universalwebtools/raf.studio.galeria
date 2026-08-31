RAF.studio Galeria v16.3.1 — REJECT WORKFLOW

Wgraj / podmień w głównym katalogu repo TYLKO te pliki:
- index.html
- app.js
- admin.html
- admin.js
- style.css

Nie trzeba ruszać:
- firebase-config.js
- database-rules.json
- storage-rules.txt
- logo-white.png
- logo-black.png

Co nowego:
- w trybie tylko „Odrzuć zdjęcie” klient widzi licznik odrzuconych,
- odrzucone zdjęcie NIE znika z „Wszystkie” — zostaje wyszarzone i oznaczone,
- filtr „Odrzucone” nadal pokazuje tylko odrzucone,
- lista nazw/numerów odrzuconych jest widoczna w panelu klienta,
- można jednym kliknięciem wyczyścić wszystkie odrzucenia,
- klient może zatwierdzić ostateczną listę zdjęć do odrzucenia,
- zatwierdzenie zapisuje datę, godzinę, liczbę i pełną listę zdjęć,
- w panelu admina log odrzuceń jest oddzielony od logu serduszek,
- panel admina nadal pokazuje odrzucone i nieodrzucone oraz pobieranie nieodrzuconych.

Firebase Rules: bez zmian.
Baza: stabilne v16.3.0 z main.
