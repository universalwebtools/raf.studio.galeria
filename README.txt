RAF.studio GALERIA v4

CO DOSTAJESZ
- index.html = galeria klienta
- admin.html = panel administratora
- zapis ulubionych do Realtime Database
- logowanie admina przez Firebase Authentication
- anonimowe logowanie klienta
- tworzenie i edycja galerii
- nazwa sesji, slug, hasło, limit ulubionych, pobieranie, aktywność
- panel wyborów klienta
- link galerii w formie: ?g=slug

1. WRZUĆ NA GITHUB
Podmień/dodaj:
index.html
admin.html
style.css
app.js
admin.js
firebase-config.js

2. REALTIME DATABASE RULES
Firebase -> Realtime Database -> Rules
Wklej zawartość pliku:
database-rules.json
i kliknij Publish.

3. STORAGE RULES
Firebase -> Storage -> Rules
Wklej zawartość:
storage-rules.txt
i kliknij Publish.

4. PANEL ADMINA
Adres:
https://universalwebtools.github.io/raf.studio.galeria/admin.html

Zaloguj się mailem i hasłem konta administratora utworzonego w Firebase Authentication.

5. TWORZENIE GALERII
W panelu:
+ Nowa galeria
np.
Nazwa: Ślub Kowalscy
Slug: kowalscy-2026
Hasło: klient123
Limit: 20

Panel utworzy dane w Realtime Database.

6. ZDJĘCIA
Na razie zdjęcia nadal wrzucasz ręcznie w Firebase Storage:

galleries/
  kowalscy-2026/
    previews/
      RAF_0001.jpg
      RAF_0002.jpg
    originals/
      RAF_0001.jpg
      RAF_0002.jpg

Nazwa preview i original musi być identyczna.

7. LINK DLA KLIENTA
Panel wygeneruje:
https://universalwebtools.github.io/raf.studio.galeria/?g=kowalscy-2026

8. ULUBIONE
Klient po wpisaniu hasła loguje się anonimowo.
Kliknięcie serca zapisuje wybór do:
galleries/{slug}/selections/{clientUid}/...

Ty w panelu klikasz:
♥ Wybory

i widzisz nazwy wybranych plików.

WAŻNE O HAŚLE
Hasło jest zapisane jako SHA-256 hash, nie jako czysty tekst.
To jest lepsze niż hasło w JavaScript, ale ponieważ klient może odczytać hash z bazy,
nie jest to jeszcze zabezpieczenie klasy profesjonalnej usługi.
Docelowo możemy dodać Cloud Function do weryfikacji hasła po stronie serwera.
