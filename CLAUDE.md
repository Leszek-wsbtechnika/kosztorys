# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Komendy

```bash
open index.html                    # uruchomienie — bez serwera, bez build-kroku
node check-math.js                 # jedyny test: matematyka kosztorysu (headless, exit 1 = rozjazd)
node check-math.js sciezka.html    # ten sam test na innym wariancie pliku
git push miniu main                # deploy — Railway buduje i wdraża automatycznie
```

Nie ma bundlera, lintera ani frameworka testowego. `check-math.js` jest samowystarczalny (czysty `node`, zero zależności).

**Deploy:** https://kosztorys.up.railway.app — Railway (konto `miniu1970@gmail.com`, projekt `determined-gratitude`, serwis `kosztorys`), auto-deploy z każdego pushu na `miniu/main`. Repo `MiniuPL/kosztorys` — remote `miniu` (`origin` = `Leszek-wsbtechnika/kosztorys`, repo źródłowe). **Oba remote'y żyją osobno — `miniu` jest gałęzią deployową i wolno mu wyprzedzać `origin`; nie synchronizuj ich bez wyraźnej prośby.** Kontener: `Dockerfile` (obraz `caddy:2-alpine`) + `Caddyfile` — serwuje **wyłącznie** `index.html` z `/srv`, nasłuch `:{$PORT:80}` (Railway wstrzykuje `PORT`). `.dockerignore` trzyma dokumentację i `check-math.js` poza obrazem. Uwaga przy przenoszeniu z `file://` na domenę Railway: `localStorage` jest origin-scoped, więc zapisane kosztorysy i sesja Supabase **nie migrują** — przenieś je eksportem/importem JSON.

CDN (wymaga internetu przy pierwszym ładowaniu): SheetJS `xlsx 0.18.5`, `@supabase/supabase-js 2.105.1` (oba z `integrity` hash), Google Fonts (Orbitron / Inter / Share Tech Mono). Cel: profesjonalny kosztorys naprawy pojazdów/maszyn (naczepy, przyczepy, ciągniki, maszyny) w układzie zbliżonym do Audatex/Audanet, do ubezpieczyciela. Pełne uzasadnienie struktury i badania w `PLAN.md`.

`index.html` (~1320 linii) — jeden plik CSS+HTML+JS; poza nim w repo są tylko `Dockerfile` + `Caddyfile` (deploy) i `check-math.js` (test). Frontend **spójny z `katalog`** (te same tokeny OKLCH i fonty Orbitron/Inter/Share Tech Mono) — patrz sekcja Design System. Komentarz autora po `<head>` jest wymagany (zasada z `../CLAUDE.md`).

## Integracja z katalogsystem.pl (projekt `katalog`)

Łączy się z **tym samym projektem Supabase co `katalog`** (`SUPABASE_URL`/`SUPABASE_KEY` skopiowane z `katalog/index.html`; anon key jest publiczny, chroniony przez RLS). Używa go **tylko do ODCZYTU tabeli `parts`**.

Logowanie jest **nieblokujące — odwrotnie niż w katalogu** (gdzie login bramkuje całość). Tu app działa w pełni offline (wpis ręczny + import JSON); login OTP (8-cyfrowy, to samo konto co katalog) służy **wyłącznie do otwarcia pickera części**. Flow: `openLogin` → `sendOtpCode` (`sb.auth.signInWithOtp`) → `verifyOtpCode` (`verifyOtp type:'email'`) → `onConnected` → `loadCatalog` (paginacja `parts` po 1000) → `openPicker`. `init()` cicho wznawia sesję jeśli istnieje. RLS `read_parts` = `TO authenticated USING(true)`, więc każda rola (nawet `nowy`) czyta części. Picker → `pickPart` dodaje **dwa** wiersze z jednej części: do `czesci` (nazwa + cena netto) **oraz** do `robocizna` (ta sama nazwa, rodzaj `W`, `czasRbg:''` puste do uzupełnienia). Filtr Kategorii (`#picker-cat`, `catalogCats`/`fillPickerCats`) + wyszukiwarka **wielowyrazowa OR** (każde słowo osobno, unia; ranking wg liczby trafionych słów) — `renderPicker()`. `zestawienie` katalogu **nie jest** dostępne (localStorage origin-scoped) — picker zastępuje „pobieranie zamówienia".

## Architektura krytyczna

### `recalc()` vs `refreshTotals()` — NIE łączyć (bug fokusa)

Najważniejsza zasada pliku. Pola w tabelach mają `oninput`/`onchange`. Gdyby handler przebudowywał `<tbody>` (innerHTML), edytowany `<input>` zostałby zniszczony → utrata focusu po jednej literze.

- `refreshTotals()` — przelicza sumy i aktualizuje **tylko komórki wartości po `id`** (`vc-{id}`, `rs-{id}`, `rv-{id}`, `lr-{id}`, `lt-{id}`) + subtotale + `#sumbox`. Przełącza też klasę `tr.zero` na wierszach o wartości 0 (przez `cell.closest('tr')`; matdod po `mk-{id}`) — dziś tylko sygnał wizualny na ekranie, bo wydruk filtruje pozycje sam. Nie dotyka inputów. Zwraca obiekt sum. Wołane przy **każdym** `oninput` (`upd()`, `onStawki()`).
- `recalc()` = `render*()` (pełna przebudowa wierszy) + `refreshTotals()`. Wołane **tylko** przy dodaj / usuń / wczytaj / reset.

**Reguła: żaden handler `oninput` nie może wołać `recalc()` ani przebudowywać wiersza.** Dodając nową kolumnę liczoną, nadaj komórce `id` i aktualizuj ją w `refreshTotals()`.

### Stan i persystencja

Globalny obiekt `K` (`blankState()`): `meta`, `obiekt`, `stawki`, oraz tablice `czesci` / `robocizna` / `lakier` / `matdod` (każdy wiersz ma `id` z `uid()`), plus `uwagi`/`podpis*`/`podstawa`. localStorage: `kosztorys_v1` = `{K, idc}`, autosave debounced w `touch()`/`persist()`. `loadPersist()` merguje wczytany stan z `blankState()` (osobno `stawki`), więc **nowa stawka z domyślną wartością wchodzi także do starych zapisów** i zmienia ich sumy — świadoma decyzja przy normaliach (2%), o której trzeba pamiętać dodając kolejne stawki. JSON eksport/import to surowy zrzut `K`; XLSX (`exportXlsx`) i druk generowane z `K`. Wydruk **nie korzysta z ekranowego DOM-u** — patrz sekcja Wydruk. Motyw ekranu (`light`/`dark`) nie wpływa na wydruk.

DOM↔stan: `readMetaFromDom`/`readStawkiFromDom` (DOM→K), `writeDomFromState` (K→DOM, po wczytaniu/imporcie). **`readMetaFromDom` podmienia całe `K.obiekt`**, więc pola bez odpowiednika w DOM (dziś `vinKrotki`) trzeba w nim jawnie przepisać — inaczej giną przy pierwszym `touch()`.

### VIN i dane warsztatu

- **VIN**: `maxlength=17`, `vinInput()` wielkie litery (z zachowaniem pozycji kursora) i przycięcie do 17 znaków. Krótszy numer **nie jest błędem** — maszyny mają krótsze numery fabryczne — więc `vinCheck()` (na `blur`) pokazuje pytanie w `#vin-warn`, a `vinAccept()` zapisuje potwierdzenie w `K.obiekt.vinKrotki`. Każda edycja numeru kasuje flagę i pytanie wraca.
- **Warsztat**: `K.meta.sporzTyp` (`Rzeczoznawca`/`Warsztat`) steruje widocznością bloku `#warsztat-box` (`onSporzTyp`). Dane siedzą w `K.warsztat` (część kosztorysu), a `saveWarsztat()`/`forgetWarsztat()` trzymają kopię pod **osobnym** kluczem localStorage `kosztorys_warsztat` — niezależnym od kosztorysu, więc przeżywa reset i wskakuje sama przy przełączeniu na „Warsztat" z pustymi polami.

### Tabele na ekranie: zawijanie i regulowane kolumny

- Kolumny tekstowe (`nrKat`, `nazwa`, `opis`) to **`<textarea class="txt">`**, nie `<input>` —
  input nie zawija tekstu, więc długie nazwy części znikały za krawędzią kolumny. `autoGrow()`
  ustawia wysokość na `scrollHeight+2` (globalne `box-sizing:border-box` → `scrollHeight` bez ramek),
  `txtKey()` przechwytuje Enter (`preventDefault`+`blur`), więc **w danych nigdy nie ma `\n`** —
  zawijanie jest wyłącznie wizualne i nie dotyka XLSX-a ani wydruku. Treść escapuje `pE()`, nie
  `esc()`: wewnątrz `<textarea>` nieescapowany `&` rozjechałby wartość przy kolejnym renderze.
- Po `render*()` leci **jeden** przebieg `growAll(tbody)`, nie `autoGrow()` na wiersz — inaczej
  28 pozycji to 28 przeliczeń layoutu przy każdym `recalc()`.
- Szerokości: `<colgroup>` + `table.tbl-fix{table-layout:fixed}` **tylko** w tabelach Części
  i Robocizny (pozostałe dwie nie mają colgroup i przy `fixed` rozjechałyby się na równe kolumny).
  Uchwyt `.col-grip` w `<th>`; przeciąganie zamraża kolumny w pikselach i zmienia **parę**
  (ciągnięta +dx, sąsiednia −dx), więc suma zostaje stała. Zapis w `localStorage['kosztorys_kolumny']`
  jako procenty — **poza `K`**, bo to preferencja urządzenia, nie dane kosztorysu (ten sam wzorzec
  co `kosztorys_warsztat`). Niezgodna liczba kolumn w zapisie → wartości domyślne `KOL_DEF`.

### Wyliczenia (czysty JS)

- część: `cenaNetto*ilosc*(1-rabat/100)*(1-potracenie/100)`
- robocizna: `czasRbg * stawkaFor(kategoria)` — `BL`→stawka blacharska; `MECH`/`EL`/`DEM-MONT`→mechaniczna
- lakier: `robocizna = czasRbg*stawka_lak`; `materiał = matKwota>0 ? matKwota : robocizna*matlak%` (wpisana kwota ma pierwszeństwo; 0 = auto ze wskaźnika; `matlak` domyślnie 40%)
- normalia = `suma_części * normalia%` (auto w podsumowaniu; blok „Materiały dodatkowe" to osobne pozycje ręczne, **nie** normalia) Dawna pozycja „materiały pomocnicze (% robocizny)" zniknęła — normalia ją zastępują, a `matpom` ze starych zapisów jest ignorowane.
- podsumowanie: Σ → netto → VAT → brutto → korekty (`+ ubytek merkantylny`, `− udział własny`); `K.podstawa` ('netto'/'brutto') wybiera bazę kwoty końcowej
- `round2()` na każdym kroku (jak w `katalog`/`czas`); `fmtPl()` ma `useGrouping:'always'`, bo pl-PL domyślnie nie grupuje czterech cyfr i w kolumnie kwot „4258,29" stało obok „18 514,30"

**Stawki to domyślne dla nowych wierszy, nie globalny mnożnik.** `addCzesc`/`submitEntry` prefillują `rabat`/`potracenie` z `K.stawki`, ale faktyczna wartość jest per-pozycja → brak podwójnego liczenia.

### Modal „Dodaj pozycję" (`openEntry`/`submitEntry`)

Jedno okno → fan-out do trzech bloków wg wypełnionych pól: cena lub nr katalogowy → `czesci`; robocizna naprawcza >0 → `robocizna`; robocizna lakiernicza >0 → `lakier`. Wspólna `nazwa`. Otwierane przyciskiem „＋ Dodaj pozycję" w blokach Części i Robocizna (obok „pusty wiersz" i pickera).

### Wydruk — osobny dokument, nie przemalowany ekran

`buildPrintDoc()` renderuje `#printdoc` z `K`: statyczne `<table>`/`<div>`, **zero `<input>`**.
Powód jest twardy: `<input>` nie zawija tekstu, więc drukowanie formularza ucinało nazwy części
i wypychało kolumnę „Wartość netto" poza szerokość A4. `@media print` ukrywa ekran regułą
`body > *:not(#printdoc){display:none}` — nie listą selektorów, żeby nowy modal nie wyciekł na papier.

- **Wydruk nic nie liczy.** Sumy bierze z `refreshTotals()` (nie `recalc()` — ten przebudowuje
  wiersze i zabiłby fokus przy Ctrl+P), wartości pozycji z `valCzesc()`/`valRobocizna()`/`valLakier()`.
- Wejścia: `beforeprint` (Ctrl+P) oraz `doPrint()` z przycisku. **Nigdy z `init()`** — stub DOM
  w `check-math.js` nie ma layoutu, więc pomiary rzuciłyby wyjątek udający zepsutą matematykę.
- **Paginacja własna**, bo Chrome nie wspiera pól marginesowych `@page`, a numer strony ma być
  w nagłówku. `PG_W/PG_H/PG_SLACK` (mm) muszą zgadzać się z `.printdoc .pg{height}` w `@media print`;
  `271mm + 2×12mm` marginesu mieści się w 297mm A4 — przy 273mm pojawiały się puste kartki.
- Pomiar idzie przez **sondę** `position:absolute;left:-10000px;visibility:hidden` z klasą `.printdoc`
  (element w `display:none` ma `offsetHeight` 0, a bez klasy mierzyłby inne style). Budżet strony =
  wysokość pustej strony odjęta od limitu — łapie też marginesy nagłówka i stopki.
- Tabela dłuższa niż strona jest dzielona z powtórzonym nagłówkiem kolumn i dopiskiem „ciąg dalszy";
  pojedynczy wiersz na końcu strony (sierota) jest przenoszony w całości.
- Puste pola, zerowe stawki i sekcje bez pozycji **nie drukują się wcale**. `markZero()`/`tr.zero`
  zostały tylko dla ekranu — wydruk filtruje pozycje sam.
- Sekcje są numerowane (`1 · Dane kosztorysu` … `7 · Podsumowanie`) numeratorem zliczanym w
  `printBlocks()`, więc pominięcie pustej sekcji nie robi dziury w numeracji.
- Stopka każdej strony: `Kosztorys sporządzony w programie: KosztorysSystem · normy czasowe
  i ceny wg danych własnych` + numer kosztorysu po prawej.
- **PDF powstaje przez „Zapisz jako PDF" w oknie druku** — świadomie bez biblioteki PDF, żeby nie
  dokładać zależności CDN. Przycisk w appbarze (`doPrint()`) nazywa się „Drukuj / PDF" i buduje
  dokument sam, bo `beforeprint` nie wszędzie jest pewne.

### Design System (wspólny z `katalog`)

Design przeniesiony 1:1 z `katalog/index.html` — te same nazwy tokenów, ta sama paleta OKLCH, te same fonty. **Zmieniając wygląd, zmieniaj oba pliki razem**; poprzedni system (Skybound: Archivo/Hanken/JetBrains, ciemny domyślnie, `--accent` = pomarańcz) został usunięty w całości.

Tokeny: `:root` (**jasny — domyślny, jak w katalogu**) + `[data-theme="dark"]`. Motyw trzymany w `localStorage['theme']` jako `light`/`dark`; `normTheme()` mapuje stare wartości Skybound (`day`/`night`) na nowe, więc zapisany motyw sprzed zmiany nie wywraca strony. `applyTheme()` ustawia atrybut `data-theme` na `<html>` — **nie klasę** (`.day-theme` już nie istnieje).

Semantyka kolorów jest katalogowa, **odwrotna niż w Skybound**: `--primary` = pomarańcz (CTA, kwoty, focus), `--accent` = zieleń (potwierdzenia, kwota końcowa), `--danger` = czerwień, `--brand-orange` = akcent marki (lewa krawędź appbara, znacznik `.doc-head h2::before`). Fonty: Orbitron (`--display` — nagłówki, przyciski, **wszystkie kwoty**), Inter (`--sans` — body, inputy), Share Tech Mono (`--mono` — etykiety, `THEAD`, metadane), Georgia (`--serif` — wyłącznie wydruk). `border-radius:0` wszędzie, płaskie powierzchnie + `1px` obramowania.

Appbar powtarza header katalogu: `--surface` + `border-left:3px solid var(--brand-orange)`, lockup `KOSZTORYS`+pomarańczowy `SYSTEM` w Orbitron, pod nim `.brand-sub` w mono. `.tbtn` = katalogowy `.btn` (Orbitron, uppercase, `letter-spacing:.08em`), warianty `.primary` (wypełniony pomarańcz) i `.ok` (zielony). **Logo czeka na zaprojektowanie** — w `.brand` jest komentarz-zaczep, a reguła `.appbar .brand svg` i `gap` zostały na miejscu, więc nowe SVG wchodzi bez zmian w CSS.

**Pułapka specyficzności — dwa razy już ugryzła.** Reguła pól obejmuje `.fld input,.fld select,.fld textarea` (0-1-1), więc:
- `input[type=number]` (0-1-1, ale *później* w pliku) bije `td input` (0-0-2) — kolumny liczbowe w tabelach wymagają jawnego wypisania `td input[type=number]`, inaczej dostają tło i padding pola formularza.
- `td textarea` (0-0-2) przegrywa z `.fld textarea` i dostaje `min-height:72px` oraz tło pola —
  stąd selektor **`td textarea.txt`** (0-1-2).
- skrót `background:` z tamtej reguły kasuje `background-repeat`/`background-position` strzałki `<select>` — reguły strzałki muszą mieć **tę samą** specyficzność (`select,.fld select,td select`), a tło w tabelach ustawiać przez `background-color`, nie skrót. Objaw: strzałka kafelkuje się na całym polu (widoczne tylko w jednym motywie).

## Weryfikacja

**Matematyka — `node check-math.js`.** Skrypt wyciąga inline `<script>` regexem i odpala go w `vm` ze stubem `document`/`supabase`/`localStorage`, po czym porównuje `recalc()` z ręcznie policzonymi kwotami. `recalc()` zwraca pełny obiekt sum — ten sam kod liczy ekran, XLSX i wydruk, więc jeden test pokrywa wszystkie trzy. Odpalaj po **każdej** zmianie w pliku, także czysto wizualnej: to najtańszy dowód, że przebudowa CSS nie ruszyła logiki.

Dwie pułapki stuba, o które łatwo się potknąć pisząc podobny test:
- `let K` i `function recalc` żyją w zasięgu skryptu, **nie** na `globalThis` — trzeba je wystawić dopiskiem `;globalThis.__K=K;globalThis.__recalc=recalc;` do kodu podawanego do `runInContext`.
- Stub elementu musi mieć `querySelectorAll`, `querySelector`, `children` i `addEventListener` —
  `growAll()`/`applyKolumny()` wołane z `render*()` i `init()` sięgają po nie na starcie.
- Stawki ustawiaj przez **DOM** (`$('s-bl').value=…`), nie przez `K.stawki` — `refreshTotals()` zaczyna od `readStawkiFromDom()` i nadpisze wartości wstrzyknięte prosto do stanu. Dodatkowo `init()` woła `writeDomFromState()`, więc zaraz po starcie w stubie siedzą domyślne stawki z `blankState()`.

**Wydruk — bez okna drukowania.** Najpierw **zwęź okno do szerokości strony**: 186 mm ≈ 703 px przy
96 dpi, więc viewport ~760 px. Przy szerokim oknie wszystko się mieści i nie zobaczysz przelewu kolumn —
czyli dokładnie tej klasy błędu, przez którą powstał osobny widok wydruku. Potem:

```js
buildPrintDoc();                        // beforeprint nie leci przy podglądzie
for (const sh of document.styleSheets)
  for (const r of sh.cssRules)
    if (r.media && r.media.mediaText.includes('print')) r.media.mediaText = 'screen';
```

Kontrola numeryczna zamiast oglądania: sklonuj każdą `.pg` do sondy i sprawdź, że `offsetHeight`
nie przekracza `271mm` — przelew oznacza obcięcie treści (`overflow:hidden`), a nie widać go na
zrzucie. Do tego: brak pustych stron, numeracja zgodna z liczbą `.pg`, sumy identyczne z ekranem.

Render / picker / OTP / oba motywy — wzrokowo w przeglądarce.

## Poza zakresem v1 (przyszłość — patrz `PLAN.md`)

Tabela `kosztorysy` w Supabase (trwałe, współdzielone kosztorysy) + RLS · persystencja `zestawienia` katalogu (cross-device „zamówienia") · własna baza norm czasowych (autocomplete) · PDF z biblioteki zamiast `window.print`.
