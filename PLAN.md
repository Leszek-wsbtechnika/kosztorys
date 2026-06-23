# Kosztorys pojazdów i maszyn — badania + plan działania

## Kontekst

Potrzebny jest nowy program (single-file HTML) do tworzenia profesjonalnych kosztorysów
napraw pojazdów i maszyn, **połączony z katalogsystem.pl** (projekt `katalog`), tak aby
pobierać dane o częściach wprost z bazy katalogu. Kosztorys ma obejmować trzy bloki kosztów:
**części**, **robocizna (naprawa)** i **lakierowanie**, w układzie zbliżonym do Audatex/Audanet.

Ustalenia z użytkownikiem:
- **Zakres:** naczepy / przyczepy + maszyny rolnicze / ciągniki; dodatkowo **ręczne** dodawanie
  pozycji części, napraw i lakierowania. (To NIE są auta osobowe — patrz uwaga o AZT niżej.)
- **Integracja:** wspólne Supabase z katalogiem (czyta tabelę `parts`).
- **Normy czasowe:** wpisywane ręcznie (bazy Audatex/AZT są licencjonowane — nie można ich kopiować).
- **Cel dokumentu:** kosztorys do ubezpieczyciela → potrącenia amortyzacyjne, urealnienie cen
  części, merkantylny ubytek wartości, rabaty.

---

## CZĘŚĆ 1 — Badania: jak wygląda profesjonalny kosztorys (Audatex/Audanet)

Profesjonalny kosztorys naprawczy ma stały, powtarzalny układ. Przejmujemy **strukturę i logikę**
Audatex (jest jawna), ale **nie kopiujemy norm czasowych ani bazy AZT** (są płatne/licencjonowane).

**Bloki dokumentu:**

1. **Nagłówek / identyfikacja** — nr kosztorysu, data, sporządzający (rzeczoznawca/warsztat),
   zleceniodawca / poszkodowany, ubezpieczyciel, nr szkody, nr polisy.
2. **Dane obiektu** — typ (naczepa / przyczepa / ciągnik / maszyna), marka, model, VIN / nr fabryczny,
   nr rej., rok produkcji, przebieg / motogodziny, data 1. rejestracji.
3. **Parametry kalkulacji (stawki)** — edytowalne, sterują całą matematyką:
   stawka roboczogodziny: blacharska, mechaniczna, lakiernicza (osobno);
   wskaźnik materiału lakierniczego; % materiałów pomocniczych; % rabatu na części;
   % potrącenia amortyzacyjnego (urealnienie); stawka VAT (23%); merkantylny ubytek; udział własny.
4. **Części** — wykaz pozycji. Kolumny: lp, nr katalogowy, nazwa, ilość, cena jedn. netto,
   rodzaj (O oryginał / Q / P / Z zamiennik), rabat %, potrącenie amortyzacyjne %, wartość netto.
5. **Robocizna naprawcza** — lp, opis operacji, kategoria (BL blacharska / MECH mechaniczna /
   EL elektryczna / DEM-MONT), rodzaj (W wymiana / N naprawa), **czas w rbg (ręcznie)**,
   stawka (wg kategorii z parametrów), wartość = czas × stawka.
6. **Lakierowanie** — osobny blok, dwie składowe na pozycję:
   robocizna lakiernicza (rbg × stawka lakiernicza) **+** materiał lakierniczy
   (kwota ręczna **lub** % robocizny lakierniczej wg wskaźnika), liczone na element lub na m².
7. **Materiały pomocnicze / dodatkowe** — % od wartości robocizny lub pozycje ręczne.
8. **Rekapitulacja (podsumowanie)** — Σ części (po rabatach/potrąceniach) + Σ robocizna +
   Σ lakierowanie (robocizna + materiał) + Σ materiały dodatkowe = **razem netto** → **VAT 23%** →
   **razem brutto**; następnie korekty ubezpieczeniowe: − merkantylny ubytek? (dodawany jako
   odrębna kwota), − udział własny, = kwota do wypłaty/naprawy. Przełącznik **podstawy netto/brutto**.
9. **Uwagi, dokumentacja fotograficzna, podpisy.**

**Robocizna — logika:** `wartość = czas (rbg) × stawka roboczogodziny`. Audatex sprowadza wszystko
do roboczogodzin (jednostki czasowe JC są tylko formą zapisu). U nas czas wpisywany ręcznie w rbg.

**Lakierowanie — UWAGA:** samochodowy model AZT (1/2/3-warstwowy, metalik, perła) **nie pasuje**
do naczep i maszyn (malowanie powierzchniowe / antykorozyjne, na m² lub element). Dlatego blok
lakierowania jest **generyczny i ręczny** — bez zaszytych typów warstw.

Źródła badań:
[Kosztorys z OC — jak czytać](https://kasapowypadku.pl/blog/kosztorys-naprawy-samochodu-z-oc-jak-czytac-i-kwestionowac/) ·
[Roboczogodzina a normy czasowe](https://warsztat.pl/artykuly/koszty-czy-ceny-napraw-powypadkowych-cz-6-cena-roboczogodziny-a-normy-czasowe-pracochlonnosci,70341,bm9uZSE3MDM0MSEhbm93b2N6ZXNueXdhcnN6dGF0LnBsL2FydHlrdWx5LzExLTIwMTk) ·
[Naliczanie kosztów lakierowania Audatex](https://www.audanet.pl/PL/docs/Lakierowanie-Naliczanie_kosztow.pdf) ·
[Audatex — słownik](https://agenci-online.pl/slownik-ubezpieczeniowy/audatex/)

---

## CZĘŚĆ 2 — Architektura

- **Forma:** osobny single-file HTML (`kosztorys/index.html`), CSS+HTML+JS, bez build/bundlera —
  spójnie z resztą mono-repo.
- **Zależności CDN:** Supabase JS client (ten sam projekt co katalog), SheetJS (XLSX). Bez biblioteki PDF.
- **Komentarz autora** po `<head>` (wymóg CLAUDE.md): `<!-- Autor: Leszek Dąbrowski | e-mail: ldabrovvski@gmail.com -->`.

### Integracja z katalogsystem.pl (ważne — odwrócony priorytet)

`zestawienie` katalogu żyje **wyłącznie w localStorage** (`katalog_zest`), a localStorage jest
przypisany do origin — więc osobny plik **nie odczyta** żywego „koszyka" katalogu, chyba że jest
serwowany z tego samego adresu. Natomiast tabela **`parts` jest w Supabase** i czytelna po zalogowaniu
z dowolnego miejsca. Dlatego:

1. **Ścieżka główna — picker z Supabase `parts`:** logowanie (OTP, jak w katalogu) → wyszukiwarka/
   przeglądarka części z tabeli `parts` → dodawanie do kosztorysu. **To realizuje „pobieranie danych
   o częściach z katalogsystem.pl".** Wymaga logowania (RLS `read_parts TO authenticated`).
2. **Ścieżka wygody (tylko wspólny origin):** jeśli kosztorys zostanie wdrożony pod tym samym adresem
   co katalog (to samo repo GitHub Pages), może odczytać `localStorage['katalog_zest']` i zaciągnąć
   bieżące zestawienie. Opcjonalne.
3. **Ścieżka offline — import JSON:** jedyna droga bez logowania/internetu (katalog eksportuje
   zestawienie/część do JSON, kosztorys importuje).

Mapowanie rekordu części jak w katalogu (`dbToPart`): `price_net`→cena netto, `name`, `category`,
`photo`, `description`. Cena z katalogu trafia do pozycji „Części" jako cena jedn. netto.

### Persystencja (v1)

localStorage + zapis/wczytaj JSON + eksport XLSX + druk — jak w `czas`/`analizator`.
**Supabase służy w v1 tylko do ODCZYTU części.** Trwałe przechowywanie kosztorysów w Supabase
(nowa tabela `kosztorysy` + RLS) = v2.

---

## Model danych (stan w pamięci + JSON)

```js
const K = {
  meta:   { nrKosztorysu, data, sporzadzajacy, zleceniodawca, ubezpieczyciel, nrSzkody, nrPolisy },
  obiekt: { typ, marka, model, vin, nrRej, rokProd, przebieg, data1Rej },
  stawki: { rbgBlach, rbgMech, rbgLak, wskMatLak, procMatPom, rabatCzesci,
            amortyzacja, vat:23, ubytekMerk, udzialWlasny, podstawa:'netto' },
  czesci:   [{ id, nrKat, nazwa, ilosc, cenaNetto, rodzaj, rabat, potracenie, zKatalogu:bool }],
  robocizna:[{ id, opis, kategoria, rodzaj, czasRbg }],
  lakier:   [{ id, element, czasRbg, matRbgPct|matKwota, naM2:bool, m2 }],
  matDodatkowe:[{ id, opis, kwota }],
  uwagi, foto:[]
}
```

## Wyliczenia (czysty JS, jak statystyka w `kosci`)

- część: `cenaNetto*ilosc*(1-rabat/100)*(1-potracenie/100)`
- robocizna: `czasRbg * stawka(kategoria)`
- lakier: `czasRbg*rbgLak + (matKwota ?? czasRbg*rbgLak*wskMatLak/100)`
- razem netto → VAT 23% → brutto; korekty: + ubytek merkantylny, − udział własny.
- `round2()` na każdym kroku (wzór z katalogu / `czas`).

## Reuse z istniejących projektów (nie pisać od zera)

- **Supabase init + OTP auth + `dbToPart`** — z `katalog/index.html` (`initAuth`/`afterSignIn`/`loadData`).
- **Autocomplete** opisów operacji/elementów — wzorzec `AC` z `czas`/`ZAZ` (opcjonalnie, ułatwia powtarzalne pozycje).
- **Eksport XLSX** (SheetJS) i **druk @media print** — wzorce z `katalog`/`czas`.
- **JSON zapis/wczytaj** — wzorzec z `analizator`/`Korelacja`.

## Styl / druk

- Ekran: może nawiązywać do estetyki katalogu, ale **wydruk = czysty, profesjonalny A4** (czytelny
  dla ubezpieczyciela) — NIE dziedziczyć cyber-theme katalogu (Orbitron / border-radius:0 / glow) w druku.

---

## Plan działania (fazy)

1. **Szkielet + dane obiektu + parametry stawek** — layout, formularz nagłówka/obiektu, panel stawek, localStorage autosave.
2. **Blok Części** — tabela z dodawaniem ręcznym + wyliczenia (rabat/potrącenie).
3. **Integracja Supabase** — logowanie OTP, picker części z `parts` (wyszukiwarka), wstawianie do bloku Części; fallback import JSON.
4. **Blok Robocizna** — kategorie BL/MECH/EL/DEM-MONT, czas rbg, stawki wg kategorii.
5. **Blok Lakierowanie** — robocizna lakiernicza + materiał (kwota lub % wskaźnika), na element/m².
6. **Materiały dodatkowe + Rekapitulacja** — sumy, VAT, korekty ubezpieczeniowe, przełącznik netto/brutto.
7. **Eksport** — druk A4 (@media print), XLSX, zapis/wczytaj JSON.
8. **Dokumentacja foto + uwagi + podpisy** (foto z `parts.photo` lub upload).

## Weryfikacja

- `open kosztorys/index.html` — formularz liczy poprawnie (ręcznie policzony przykład = wynik programu).
- Logowanie OTP działa; picker pokazuje części z `parts`; dodana część przenosi nazwę + cenę netto.
- Import JSON działa offline (bez logowania).
- Wydruk: `Cmd+P` → czytelny A4, wszystkie bloki + rekapitulacja, bez cyber-theme.
- XLSX otwiera się w Excelu z wszystkimi pozycjami i sumami.
- Zapis→odśwież→wczytaj JSON odtwarza cały stan.

## Poza zakresem v1 (przyszłość)

- Tabela `kosztorysy` w Supabase (trwałe, współdzielone kosztorysy między urządzeniami) + RLS.
- Persystencja `zestawienia` katalogu w Supabase → prawdziwe „zamówienia" cross-device.
- Własna baza norm czasowych (autocomplete czasów dla powtarzalnych operacji).
- Generator PDF z biblioteką (zamiast `window.print`).

---

## Stan realizacji (v1 — gotowe)

Zaimplementowano w `kosztorys/index.html` wszystkie 8 faz. Zweryfikowano:
- składnia JS poprawna,
- `recalc()` daje poprawne wyniki na ręcznie policzonym przykładzie (12 wartości, co do grosza).
Do sprawdzenia wzrokowego w przeglądarce: render tabel, picker, układ druku, login OTP, round-trip JSON.
