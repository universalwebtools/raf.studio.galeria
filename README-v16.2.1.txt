RAF.studio Galeria v16.2.1 — HERO DESIGNER HOTFIX

NAPRAWIONY BŁĄD:
W v16.2 w funkcji readSiteSettings znajdowało się przypadkowe:
heroBgColor: ..., r,

To powodowało ReferenceError dopiero przy kliknięciu:
Ustawienia strony

Skutek:
- reszta panelu działała
- tylko przycisk Ustawienia strony wyglądał jak zawieszony / martwy

v16.2.1:
- usuwa błędne "r"
- Ustawienia strony otwierają się ponownie
- HERO Designer działa
- dodałem try/catch do otwierania konfiguratora
- jeśli kiedyś wystąpi błąd, zobaczysz komunikat zamiast "martwego" przycisku

NIE ZMIENIAJ:
- Realtime Database Rules
- Storage Rules

Wgraj pliki na GitHub i zrób Ctrl+F5.
