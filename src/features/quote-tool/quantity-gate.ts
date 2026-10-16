// The raw-line side of quantity acceptance (docs/boxt/plan.md B10b): fail closed. Client-safe and pure.
//
// A customer's quantity is converted into the chosen item's pricing unit (./units.ts convertQuantity),
// or kept as the same number without a note, only when BOTH hold:
//   1. the description: the line's description is fully accounted for by the chosen item (the
//      matcher's Strict total accounting, accountLine in src/server/matching; carried on each
//      ScoredItem as `accounted`). A stated pack that differs, a second size, a number or a word the
//      item does not confirm are all blockers there;
//   2. the raw line (this file): once a leading list marker ("1."), the description, the supplier's
//      SKU (only an ordinary code: ordinarySku) and the parser's quantity phrase (its number and unit word, with a "qty"/"x" label) are
//      taken out of the raw text by exact span, with any plain currency amount ("$1.10", "$1.10 ea",
//      "USD 45.00", a line total; never "$45/cs": that unit stays), nothing is left but separators and a few filler words:
//      no digit of any script, and no word but FILLER;
//   3. the pack kind: each pack the description states (the matcher reads them; packContainersOf) is
//      per the item's own pack: the matcher counts a box, a case and a bundle alike, the quantity does
//      not (./units.ts QuantityGate.packs).
// Nothing here recognises pack wording: whatever is left over flags, whatever it says.

import {QUOTE_LIMITS} from '@/features/quotes/limits';

/** Words that may be left over without meaning anything about the quantity. */
const FILLER=new Set(['qty','quantity','please','pls','of']);
/** Labels before the quantity's number that belong to the quantity phrase: "qty 2 cases", "x 4 bundles". */
const QTY_LABEL=new Set(['qty','quantity','x','×']);
const MAX_LEFTOVER=60;
/** Anything left but spaces, separators (, . ; : brackets quotes ! ? dashes • |) and the words and digits checked above: ~ # = + * @ % < > ≈ ± / & $ … */
const SYMBOL=/[^\s\p{L}\p{M}\p{N},.;:()[\]{}'"!?\-–—•·|]/u;
/** "$1,100.00", "USD 45", optionally followed by exactly "ea", "each" or "/ea"; never glued to more letters or digits. */
const CURRENCY=/(?<![\p{L}\p{N}$])(?:\$|USD\s*)\s*(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:\s*\/\s*ea\b|\s*(?:ea|each)\b)?(?![\p{L}\p{N}.,]\p{N}|[\p{L}\p{N}])/giu;

const words=(kind:string,text:string)=>text.split(' ').map(w=>[w,kind] as const);
/** Unit words as one name, so the parser's unit ("case") finds the customer's word ("cs", "cartons"). */
const UNIT_NAMES:ReadonlyMap<string,string>=new Map([
  ...words('each','each ea pc pcs piece pieces'),
  ...words('bundle','bundle bundles bdl bdls bndl bndls'),
  ...words('case','case cases cs carton cartons ctn ctns'),
  ...words('box','box boxes bx bxs'),
  ...words('roll','roll rolls rl rls'),
  ...words('pack','pack packs pk pks pkg pkgs'),
  ...words('coil','coil coils'),
  ...words('pallet','pallet pallets plt plts'),
]);

/** A unit word as one name: "cases"/"cs"/"carton" -> case, "pcs" -> each, "boxes" -> box, "mailers" -> mailer. */
export function unitName(word:string|null|undefined):string|null{
  const w=(word??'').trim().toLowerCase().replace(/\.$/,'');
  if(!w)return null;
  return UNIT_NAMES.get(w)??w.replace(/(x|ch|sh)es$/,'$1').replace(/(?<=[a-z]{2})s$/,'');
}

interface Token {text:string;start:number;end:number}
/** Words (any script) and digit runs (any script), as in the text. */
const CONTENT=/[\p{L}\p{M}]+|\p{N}+/gu;
const tokens=(text:string,from=0,to=text.length):Token[]=>[...text.slice(from,to).matchAll(CONTENT)].map(m=>({text:m[0].toLowerCase(),start:from+m.index,end:from+m.index+m[0].length}));

/** Container and count abbreviations a supplier code must not carry as a segment, a prefix or a suffix. */
const PACK_CODES=new Set('cs case bdl bundle bx box pk pack ct ctn carton ea pc pcs rl roll skid plt'.split(' '));
/**
 * An ordinary supplier code ("S-4128", "S-14823BL", "PB3866"): letters and digits with at most one
 * hyphen, and no container or count abbreviation as a segment or as the letters it starts or ends with
 * ("CS-500", "500CS", "BDL25" may be pack text the parser filed as a SKU). Any other "SKU" is left in
 * the raw line, so it counts as leftover and flags.
 */
export function ordinarySku(sku:string):boolean{
  if(!/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)?$/u.test(sku))return false;
  return sku.toLowerCase().split('-').every(segment=>{
    const lead=/^\p{L}+/u.exec(segment)?.[0],trail=/\p{L}+$/u.exec(segment)?.[0];
    return !PACK_CODES.has(segment)&&!(lead&&PACK_CODES.has(lead))&&!(trail&&PACK_CODES.has(trail));
  });
}

export interface RawLine {
  rawText:string;
  /** The parser's description of the item. */
  description:string;
  /** The supplier's own SKU the parser took out ("S-4128"), or null. */
  suppliersSku?:string|null;
  quantity:number|null;
  unit:string|null;
}

/**
 * What is left of the customer's raw line besides the description, the supplier's SKU and the
 * quantity phrase, when anything that could be about the quantity is (a digit, a word not in FILLER):
 * the leftover text as written, trimmed (null: nothing). Fail closed: a description the raw line does
 * not contain word for word leaves the whole line over.
 */
export function rawLeftover({rawText,description,suppliersSku,quantity,unit}:RawLine):string|null{
  const text=rawText.normalize('NFKC');
  const removed=new Array<boolean>(text.length).fill(false);
  const remove=(from:number,to:number)=>{for(let i=from;i<to;i++)removed[i]=true;};
  const free=(t:Token)=>!removed.slice(t.start,t.end).some(Boolean);

  // A list marker the parser drops ("1.", "2)", "-", "•") at the very start.
  // A numbered marker is at most the list's line limit: "500." is not a line number.
  const marker=/^\s*(?:[-*•·]|(\d{1,3})[.)])\s+/.exec(text);
  if(marker&&(!marker[1]||Number(marker[1])<=QUOTE_LIMITS.linesMax))remove(0,marker[0].length);
  // The supplier's SKU, by exact span.
  const sku=suppliersSku?.normalize('NFKC').trim();
  if(sku&&ordinarySku(sku)){
    const at=text.toLowerCase().indexOf(sku.toLowerCase());
    if(at>=0)remove(at,at+sku.length);
  }
  // The description: its words and numbers, in order, as one run of the raw line's (marks between may differ).
  const want=tokens(description.normalize('NFKC'));
  if(want.length){
    const have=tokens(text).filter(free);
    for(let i=0;i+want.length<=have.length;i++){
      if(want.every((w,k)=>have[i+k].text===w.text)){
        remove(have[i].start,have[i+want.length-1].end);
        break;
      }
    }
  }
  // A plain currency amount: a unit price each ("$1.10", "$1.10 ea", "$1.10/ea", "USD 45.00") or a line
  // total ("$110.00"). Only "ea"/"each" may follow it: a price per anything else ("$45/cs", "$0.50 per
  // bundle") leaves that unit behind, which flags.
  for(const m of text.matchAll(CURRENCY)){
    const span={start:m.index,end:m.index+m[0].length};
    if(!removed.slice(span.start,span.end).some(Boolean))remove(span.start,span.end);
  }
  // The quantity phrase: its number, with its unit word right after it and a label before it.
  if(quantity!==null){
    const name=unitName(unit);
    const rest=tokens(text).filter(free);
    const value=(i:number)=>{
      // "2,000" is three tokens: 2 , 000.
      let j=i,raw=rest[i].text;
      while(j+1<rest.length&&/^\d{3}$/.test(rest[j+1].text)&&text.slice(rest[j].end,rest[j+1].start)===','){j++;raw+=rest[j].text;}
      if(j+1<rest.length&&/^\d+$/.test(rest[j+1].text)&&text.slice(rest[j].end,rest[j+1].start)==='.'){j++;raw+=`.${rest[j].text}`;}
      return /^[\d.]+$/.test(raw)?{n:Number(raw),last:j}:null;
    };
    let found:{from:number;to:number}|null=null;
    for(let i=0;i<rest.length;i++){
      if(!/^\d+$/.test(rest[i].text))continue;
      const v=value(i);
      if(!v||v.n!==quantity)continue;
      const between=(a:Token,b:Token)=>/^[\s\-.:]*$/.test(text.slice(a.end,b.start));
      let to=rest[v.last].end;
      if(name){
        const next=rest[v.last+1];
        const said=next?unitName(next.text):null;
        // The raw word must be the parser's unit: "800 boxes" read as "each" is not 800 each (the dialog's unit
        // rules treat a box differently), so a disagreement leaves the phrase over and flags.
        if(!next||!between(rest[v.last],next)||said!==name)continue;
        to=next.end;
      }
      let from=rest[i].start;
      const label=rest[i-1];
      if(label&&QTY_LABEL.has(label.text)&&between(label,rest[i]))from=label.start;
      else{
        // "×" is a symbol, not a word token: "× 4 bundles".
        const times=/(?:^|\s)×\s*$/.exec(text.slice(0,from));
        if(times)from=times.index+times[0].indexOf('×');
      }
      found={from,to};
    }
    if(found)remove(found.from,found.to);
  }

  const left=[...text].map((c,i)=>removed[i]?' ':c).join('');
  const dirty=/\p{N}/u.test(left)||tokens(left).some(t=>!FILLER.has(t.text))||SYMBOL.test(left);
  if(!dirty)return null;
  // As written, without brackets (so a flag's own brackets stay balanced) or stray separators at the ends.
  const shown=left.replace(/[()[\]{}]/g,' ').replace(/\s+/g,' ').replace(/^[\s,;:.\-–—]+|[\s,;:\-–—]+$/g,'').trim();
  return shown.length>MAX_LEFTOVER?`${shown.slice(0,MAX_LEFTOVER-1).trimEnd()}…`:shown;
}
