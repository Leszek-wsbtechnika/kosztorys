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
    appendChild(){}, setAttribute(){}, getAttribute(){ return null; } };
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
