# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Run

```bash
open index.html   # bez serwera
```

**Deploy:** Railway (konto `miniu1970@gmail.com`) z repo `MiniuPL/kosztorys` — remote `miniu` (`origin` = `Leszek-wsbtechnika/kosztorys`, repo źródłowe). Kontener: `Dockerfile` (obraz `caddy:2-alpine`) + `Caddyfile` — serwuje **wyłącznie** `index.html` z `/srv`, nasłuch `:{$PORT:80}` (Railway wstrzykuje `PORT`). `.dockerignore` trzyma `CLAUDE.md`/`PLAN.md` poza obrazem. Uwaga przy przenoszeniu z `file://` na domenę Railway: `localStorage` jest origin-scoped, więc zapisane kosztorysy i sesja Supabase **nie migrują** — przenieś je eksportem/importem JSON.

CDN (wymaga internetu przy pierwszym ładowaniu): SheetJS `xlsx 0.18.5`, `@supabase/supabase-js 2.105.1` (oba z `integrity` hash), Google Fonts (Archivo / Hanken Grotesk / JetBrains Mono). Brak build/bundlera/testów. Cel: profesjonalny kosztorys naprawy pojazdów/maszyn (naczepy, przyczepy, ciągniki, maszyny) w układzie zbliżonym do Audatex/Audanet, do ubezpieczyciela. Pełne uzasadnienie struktury i badania w `PLAN.md`.

`index.html` (~960 linii) — jeden plik CSS+HTML+JS. Frontend wg systemu **Skybound** (skill `strona`) — patrz sekcja Design System. Komentarz autora po `<head>` jest wymagany (zasada z `../CLAUDE.md`).

## Integracja z katalogsystem.pl (projekt `katalog`)

Łączy się z **tym samym projektem Supabase co `katalog`** (`SUPABASE_URL`/`SUPABASE_KEY` skopiowane z `katalog/index.html`; anon key jest publiczny, chroniony przez RLS). Używa go **tylko do ODCZYTU tabeli `parts`**.

Logowanie jest **nieblokujące — odwrotnie niż w katalogu** (gdzie login bramkuje całość). Tu app działa w pełni offline (wpis ręczny + import JSON); login OTP (8-cyfrowy, to samo konto co katalog) służy **wyłącznie do otwarcia pickera części**. Flow: `openLogin` → `sendOtpCode` (`sb.auth.signInWithOtp`) → `verifyOtpCode` (`verifyOtp type:'email'`) → `onConnected` → `loadCatalog` (paginacja `parts` po 1000) → `openPicker`. `init()` cicho wznawia sesję jeśli istnieje. RLS `read_parts` = `TO authenticated USING(true)`, więc każda rola (nawet `nowy`) czyta części. Picker → `pickPart` dodaje **dwa** wiersze z jednej części: do `czesci` (nazwa + cena netto) **oraz** do `robocizna` (ta sama nazwa, rodzaj `W`, `czasRbg:''` puste do uzupełnienia). Filtr Kategorii (`#picker-cat`, `catalogCats`/`fillPickerCats`) + wyszukiwarka **wielowyrazowa OR** (każde słowo osobno, unia; ranking wg liczby trafionych słów) — `renderPicker()`. `zestawienie` katalogu **nie jest** dostępne (localStorage origin-scoped) — picker zastępuje „pobieranie zamówienia".

## Architektura krytyczna

### `recalc()` vs `refreshTotals()` — NIE łączyć (bug fokusa)

Najważniejsza zasada pliku. Pola w tabelach mają `oninput`/`onchange`. Gdyby handler przebudowywał `<tbody>` (innerHTML), edytowany `<input>` zostałby zniszczony → utrata focusu po jednej literze.

- `refreshTotals()` — przelicza sumy i aktualizuje **tylko komórki wartości po `id`** (`vc-{id}`, `rs-{id}`, `rv-{id}`, `lr-{id}`, `lt-{id}`) + subtotale + `#sumbox`. Przełącza też klasę `tr.zero` na wierszach o wartości 0 (przez `cell.closest('tr')`; matdod po `mk-{id}`) — używana do ukrycia ich na wydruku. Nie dotyka inputów. Zwraca obiekt sum. Wołane przy **każdym** `oninput` (`upd()`, `onStawki()`).
- `recalc()` = `render*()` (pełna przebudowa wierszy) + `refreshTotals()`. Wołane **tylko** przy dodaj / usuń / wczytaj / reset.

**Reguła: żaden handler `oninput` nie może wołać `recalc()` ani przebudowywać wiersza.** Dodając nową kolumnę liczoną, nadaj komórce `id` i aktualizuj ją w `refreshTotals()`.

### Stan i persystencja

Globalny obiekt `K` (`blankState()`): `meta`, `obiekt`, `stawki`, oraz tablice `czesci` / `robocizna` / `lakier` / `matdod` (każdy wiersz ma `id` z `uid()`), plus `uwagi`/`podpis*`/`podstawa`. localStorage: `kosztorys_v1` = `{K, idc}`, autosave debounced w `touch()`/`persist()`. JSON eksport/import to surowy zrzut `K`; XLSX (`exportXlsx`) i druk generowane z `K`. Druk (`@media print`) nadpisuje tokeny motywu na biel/czerń, ramki = szara linia przerywana, i **ukrywa wiersze o wartości 0** (`tr.zero`). Motyw ekranu (Skybound) nie wpływa na wydruk.

DOM↔stan: `readMetaFromDom`/`readStawkiFromDom` (DOM→K), `writeDomFromState` (K→DOM, po wczytaniu/imporcie).

### Wyliczenia (czysty JS)

- część: `cenaNetto*ilosc*(1-rabat/100)*(1-potracenie/100)`
- robocizna: `czasRbg * stawkaFor(kategoria)` — `BL`→stawka blacharska; `MECH`/`EL`/`DEM-MONT`→mechaniczna
- lakier: `robocizna = czasRbg*stawka_lak`; `materiał = matKwota>0 ? matKwota : robocizna*matlak%` (wpisana kwota ma pierwszeństwo; 0 = auto ze wskaźnika; `matlak` domyślnie 40%)
- materiały pomocnicze = `(robocizna + robocizna_lak) * matpom%` (auto w podsumowaniu)
- podsumowanie: Σ → netto → VAT → brutto → korekty (`+ ubytek merkantylny`, `− udział własny`); `K.podstawa` ('netto'/'brutto') wybiera bazę kwoty końcowej
- `round2()` na każdym kroku (jak w `katalog`/`czas`)

**Stawki to domyślne dla nowych wierszy, nie globalny mnożnik.** `addCzesc`/`submitEntry` prefillują `rabat`/`potracenie` z `K.stawki`, ale faktyczna wartość jest per-pozycja → brak podwójnego liczenia.

### Modal „Dodaj pozycję" (`openEntry`/`submitEntry`)

Jedno okno → fan-out do trzech bloków wg wypełnionych pól: cena lub nr katalogowy → `czesci`; robocizna naprawcza >0 → `robocizna`; robocizna lakiernicza >0 → `lakier`. Wspólna `nazwa`. Otwierane przyciskiem „＋ Dodaj pozycję" w blokach Części i Robocizna (obok „pusty wiersz" i pickera).

### Design System (Skybound, skill `strona`)

Tokeny w `:root` (ciemne) + `:root.day-theme` (jasne). **Domyślnie motyw ciemny** (night); `toggleTheme()` przełącza i zapisuje `localStorage['theme']`, `applyTheme()` w `init()`. Fonty: Archivo (`--font-display`, nagłówki), Hanken Grotesk (`--font-sans`, body), JetBrains Mono (`--font-mono`, liczby/inputy), Georgia (`--font-serif`, druk). Akcent pomarańczowy `--accent`, `border-radius:2px`.

**Aliasy zgodności**: stare nazwy zmiennych (`--ink`, `--line`, `--panel`, `--head`, `--accent-d`, `--ok`, `--danger`, `--zebra`) są zmapowane na tokeny Skybound w `:root` — dzięki temu stary CSS/JS działa bez przepisywania. Nagłówki modułów (`.doc-head h2`) **bez numerów**; pomarańczowy znacznik to `::before`.

## Weryfikacja (bez przeglądarki)

Krytyczna matematyka testowalna headless: wyciągnij inline `<script>` regexem, odpal w `node` `vm` ze stubem `document`/`supabase`/`localStorage`, ustaw wartości stawek w stubie DOM, wstrzyknij przykładowe `K.czesci/robocizna/lakier/matdod`, wywołaj `JSON.stringify(recalc())` i porównaj z ręcznie policzonym wynikiem. `recalc()` zwraca pełny obiekt sum — dlatego ten sam kod liczy ekran, XLSX i daje się testować. Render/picker/druk/OTP sprawdzać wzrokowo w przeglądarce.

## Poza zakresem v1 (przyszłość — patrz `PLAN.md`)

Tabela `kosztorysy` w Supabase (trwałe, współdzielone kosztorysy) + RLS · persystencja `zestawienia` katalogu (cross-device „zamówienia") · własna baza norm czasowych (autocomplete) · PDF z biblioteki zamiast `window.print`.
