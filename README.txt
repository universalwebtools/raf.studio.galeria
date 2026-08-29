RAF.studio v7 - szybszy upload mobilny

Podmień na GitHubie:
- admin.html
- admin.js

Najważniejsze zmiany:
- realny postęp uploadu bajt po bajcie
- pokazuje dokładnie, czy trwa podgląd czy oryginał
- podgląd 1600 px / JPEG 76%, więc telefon generuje go szybciej
- podgląd wysyłany najpierw
- dokładny kod błędu Firebase przy awarii
- wersja ?v=7 omija cache przeglądarki

UWAGA:
Jeśli w tle nadal widzisz Permission denied, najpierw popraw reguły Realtime Database.
Storage także musi mieć regułę write dla UID admina.
