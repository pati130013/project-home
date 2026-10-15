# Project Home – instrukcja uruchomienia (wszystko za darmo)

## 0. Test lokalny
Otwórz `index.html` w przeglądarce. Bez konfiguracji działa w trybie lokalnym (dane tylko w tej przeglądarce).

## 1. Baza danych i logowanie (Supabase, plan Free)
1. Załóż konto na https://supabase.com i utwórz projekt (region: Frankfurt).
2. **SQL Editor** → New query → wklej zawartość `schema.sql` → Run.
3. **Authentication → Users → Add user**: dodaj dwa konta (Wasze e-maile + hasła, zaznacz „Auto confirm").
4. **Authentication → Sign In / Providers → Email**: wyłącz „Allow new users to sign up" (nikt obcy się nie zarejestruje).
5. **Database → Replication**: włącz realtime dla tabel `tasks` i `links` (zmiany pojawiają się od razu na drugim urządzeniu).
6. **Project Settings → API**: skopiuj `Project URL` i klucz `anon public` do `config.js`.

## 2. Hosting (GitHub Pages, za darmo)
1. Załóż repozytorium na GitHub i wgraj pliki z tego folderu.
2. Settings → Pages → Branch: `main` → Save.
3. Po minucie strona działa pod `https://TWOJ-LOGIN.github.io/NAZWA-REPO/`.

Alternatywa bez Gita: przeciągnij folder na https://app.netlify.com/drop.

## 3. Telefon
Otwórz adres strony → w Safari „Udostępnij → Do ekranu początkowego", w Chrome „Dodaj do ekranu głównego".

Klucz `anon` jest publiczny z założenia – dane chronią reguły RLS z `schema.sql` i brak rejestracji.
