#!/usr/bin/env node
/* Headless test matematyki kosztorysu — jedyny automatyczny test w tym projekcie.
 *
 *   node check-math.js            # domyślnie index.html
 *   node check-math.js index.html
 *
 * Wyciąga inline <script> z index.html i odpala go w `vm` ze stubem DOM.
 * Cała matematyka (valCzesc/valRobocizna/valLakier/refreshTotals) jest czystym JS
 * i nie dotyka niczego poza .value/.textContent, więc stub wystarcza.
 *
 * Stawki ustawiamy przez DOM, nie przez K.stawki — refreshTotals() zaczyna od
 * readStawkiFromDom(), więc nadpisałby wartości wstrzyknięte prosto do stanu.
 * Uwaga: init() woła writeDomFromState(), przez co po starcie w stubie siedzą
 * domyślne stawki z blankState() — dlatego wpisujemy swoje dopiero po odpaleniu.
 */
const fs = require('fs'), vm = require('vm');

const file = process.argv[2] || 'index.html';
const html = fs.readFileSync(file, 'utf8');
const m = html.match(/<script>\n([\s\S]*?)<\/script>/);
if (!m) { console.error('Nie znaleziono inline <script> w ' + file); process.exit(2); }

function mkEl(id) {
  return { id, value:'', textContent:'', innerHTML:'', className:'', style:{}, checked:false,
    classList:{ toggle(){}, add(){}, remove(){} },
    closest(){ return { classList:{ toggle(){} } }; },
    appendChild(){}, setAttribute(){}, getAttribute(){ return null; },
    querySelectorAll(){ return []; }, querySelector(){ return null; }, children:[],
    focus(){}, blur(){}, addEventListener(){} };
}
const els = {};
const document = {
  getElementById: id => els[id] || (els[id] = mkEl(id)),
  documentElement: { classList:{ toggle(){} }, setAttribute(){}, getAttribute(){ return null; } },
  createElement: () => mkEl('tmp'), querySelectorAll: () => [], addEventListener(){}
};
const store = {};
const ctx = {
  document, console, setTimeout, clearTimeout, XLSX:{}, alert(){}, confirm:()=>false,
  window:{ addEventListener(){}, print(){} },
  TextEncoder, TextDecoder, btoa, atob, Uint8Array,
  localStorage:{ getItem:k=>store[k]??null, setItem:(k,v)=>{store[k]=String(v);}, removeItem:k=>{delete store[k];} },
  supabase:{ createClient:()=>({ auth:{ onAuthStateChange(){}, getSession:async()=>({data:{session:null}}) } }) },
  fetch: () => Promise.reject(new Error('brak sieci w teście'))
};
ctx.globalThis = ctx;
vm.createContext(ctx);
// `let K` / `function recalc` żyją w zasięgu skryptu, nie na globalThis — wystawiamy je jawnie
vm.runInContext(m[1] + '\n;globalThis.__K=K;globalThis.__recalc=recalc;', ctx);

const K = ctx.__K, $ = id => ctx.document.getElementById(id);

Object.entries({ 's-bl':120, 's-mech':110, 's-lak':130, 's-matlak':40, 's-normalia':2,
  's-rabat':0, 's-amort':0, 's-vat':23, 's-ubytek':500, 's-udzial':1000 })
  .forEach(([id, v]) => { $(id).value = String(v); });

K.czesci   = [ { id:1, nrKat:'A1', nazwa:'Błotnik', ilosc:2, cenaNetto:500, rabat:10, potracenie:5 },
               { id:2, nrKat:'B2', nazwa:'Lampa',   ilosc:1, cenaNetto:320.55, rabat:0, potracenie:0 } ];
K.robocizna= [ { id:3, opis:'Wymiana błotnika', kategoria:'BL', rodzaj:'W', czasRbg:4.5 },
               { id:4, opis:'Diagnostyka',      kategoria:'EL', rodzaj:'N', czasRbg:1.25 } ];
K.lakier   = [ { id:5, element:'Błotnik', m2:0.8, czasRbg:3, matKwota:0 },      // materiał auto: 40% robocizny
               { id:6, element:'Zderzak', m2:1.2, czasRbg:2, matKwota:150 } ];  // materiał wpisany ręcznie
K.matdod   = [ { id:7, opis:'Normalia', kwota:87.4 } ];
K.podstawa = 'brutto';

// Wartości policzone ręcznie — patrz sekcja „Wyliczenia" w CLAUDE.md
const OCZEKIWANE = {
  sumCz:1175.55,      // 500*2*0.9*0.95 + 320.55
  sumRob:677.5,       // 4.5*120 + 1.25*110  (EL → stawka mechaniczna)
  lakRob:650,         // (3+2)*130
  lakMat:306,         // 3*130*0.4 + 150
  sumLak:956,
  normalia:23.51,     // 2% * 1175.55 (liczone od części)
  sumMatDod:87.4,
  razemNetto:2919.96, // 1175.55 + 677.5 + 956 + 23.51 + 87.4
  vatKw:671.59,
  razemBrutto:3591.55,
  ubytek:500, udzial:1000,
  koncowa:3091.55     // brutto + ubytek − udział własny
};

const wynik = ctx.__recalc();
const bledy = Object.entries(OCZEKIWANE).filter(([k, v]) => wynik[k] !== v);
if (bledy.length) {
  console.error('NIEZGODNE:');
  bledy.forEach(([k, v]) => console.error(`  ${k}: oczekiwano ${v}, jest ${wynik[k]}`));
  process.exit(1);
}
console.log('OK — wszystkie sumy zgodne (' + Object.keys(OCZEKIWANE).length + ' pozycji)');

// --- LakierSystem w obie strony: ref na wierszach, aktualizacja w miejscu zamiast dopisywania ---
// Funkcje top-level skryptu są na globalThis kontekstu; pracujemy na osobnym dokumencie, nie na K z testu sum.
let fail = 0;
const ok = (name, cond, info) => { if (!cond) fail++; console.log(`${cond ? '✓' : '✗'} ${name}${cond ? '' : '  ' + JSON.stringify(info)}`); };
const D = ctx.blankState();
D.czesci = [ { id:1, nazwa:'Zderzak przedni', ilosc:1, cenaNetto:900 } ];
D.lakier = [ { id:11, element:'Zderzak przedni', m2:0, czasRbg:'', matKwota:0 },
             { id:12, element:'Błotnik przedni lewy', m2:0, czasRbg:0, matKwota:0 },
             { id:13, element:'Maska', m2:1.1, czasRbg:2.5, matKwota:0 },     // ma czas → nie jedzie
             { id:14, element:'  ', m2:0, czasRbg:'', matKwota:0 } ];          // bez nazwy → nie jedzie
const out = ctx.buildLakierSystemPayload(D, 'https://kosztorys.katalogsystem.pl/');
ok('do LS: tylko wiersze z nazwą i bez czasu', out.rows.length === 2, out.rows);
ok('do LS: ref = k<sid>-<id> zapisany na wierszu', out.rows[0].ref === `k${D.sid}-11` && D.lakier[0].ref === out.rows[0].ref, out.rows[0]);
ok('do LS: nowa = nazwa jest w Częściach', out.rows[0].nowa === true && out.rows[1].nowa === false, out.rows);
ok('do LS: payload przechodzi przez base64url (polskie znaki)',
  ctx.decodeLakierPayload(ctx.encodeLakierPayload(out)).rows[1].element === 'Błotnik przedni lewy');

const zLS = [ { element:'Zderzak przedni: st. K1R (LE / LE1)', m2:0.8, czasRbg:1.6, ref:out.rows[0].ref },
              { element:'Błotnik przedni lewy: st. I (LE)', m2:0.6, czasRbg:0.8, ref:out.rows[1].ref },
              { element:'Przygotowanie do lakierowania (2-warstw.)', m2:0, czasRbg:2.1, ref:'prep' } ];
const w1 = ctx.mergeLakier(D.lakier, JSON.parse(JSON.stringify(zLS)));
ok('powrót: 2 uzupełnione w miejscu, przygotowanie dopisane', w1.zaktualizowane === 2 && w1.dodane === 1 && D.lakier.length === 5, w1);
ok('powrót: wiersz ma czas i nazwę z LS, kolejność zachowana', D.lakier[0].czasRbg === 1.6 && D.lakier[0].element.startsWith('Zderzak') && D.lakier[0].id === 11, D.lakier[0]);
const w2 = ctx.mergeLakier(D.lakier, JSON.parse(JSON.stringify(zLS)));
ok('ponowna wysyłka: 3 zaktualizowane, 0 dodanych', w2.zaktualizowane === 3 && w2.dodane === 0 && D.lakier.length === 5, w2);
ok('ponowna wysyłka: nic nie jedzie z powrotem do LS (wiersze mają czas)', ctx.buildLakierSystemPayload(D, '').rows.length === 0);
const w3 = ctx.mergeLakier(D.lakier, [ { element:'Dach', m2:1, czasRbg:3, ref:'' } ]);
ok('stary LS bez ref: dopisanie', w3.dodane === 1 && D.lakier.length === 6, w3);

// nowy dokument (resetAll → nowy sid): te same id wierszy, ale stare ref nie mogą trafić w obce wiersze
const N = ctx.blankState();
N.lakier = [ { id:11, element:'Lampa', m2:0, czasRbg:'', matKwota:0 } ];
ctx.buildLakierSystemPayload(N, '');
const w4 = ctx.mergeLakier(N.lakier, JSON.parse(JSON.stringify(zLS.slice(0, 2))));
ok('nowy dokument: stary payload = 0 zaktualizowanych', w4.zaktualizowane === 0 && N.lakier[0].element === 'Lampa', { w4, row:N.lakier[0] });

if (fail) { console.error(`\n✗ ${fail} błędów`); process.exit(1); }
