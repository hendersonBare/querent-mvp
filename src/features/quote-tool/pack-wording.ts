// The customer's pack wording in a line (docs/boxt/plan.md B10b): fail closed. Client-safe and pure.
//
// A quantity is converted into the item's pricing unit (./units.ts convertQuantity), or kept as the same
// number in the same unit without a note, only when the customer's line (its description AND its raw
// text) either has no pack wording besides the quantity's own unit ("10 bundles", "2 cases", "500
// boxes"), or all of its pack wording is ONE fully read pack statement ("50/bundle", "case of 500",
// "500 ct") that convertQuantity then compares with the item's pack. readPacks does not try to
// understand every way of stating a pack: it finds pack VOCABULARY and reports whatever a statement or
// the quantity did not use as `unread`, which always flags.
//
// How a line is read, per text (the description first, then the raw line; a description that is a part of
// the raw line, as the scripted parser leaves it, is read only as part of the raw line):
//   1. Tokens: numbers ("1,000", "2.5"), words, and single marks, after NFKC and with every slash-like
//      character ("⁄", "∕", "÷") read as "/".
//   2. The quantity: the parsed quantity's number followed by its unit word (directly, or after up to 3
//      plain words: "500 Corrugated Boxes"), with a "qty"/"x" label before it; else the number alone
//      when labelled ("qty 12", "x 12") or first or last in the text. BOXT's price tiers ("bundle
//      pricing", "pallet pricing") state no pack. Used tokens are consumed.
//   3. Pack statements, on unconsumed tokens (a small grammar, on purpose):
//        S1  N [piece] (/|per|a|an) CONTAINER   "50/bundle", "500 pcs/case", "36 rolls per case", "500 a case"
//        S2  CONTAINER of N [piece]             "case of 500", "bundle of 25 boxes"; also "2 cases of 500",
//                                               whose container word is the quantity's unit
//        S3  N[-](ct|cnt|count|pk|pack|pkg)     "500 ct", "12-pack"
//      N is a plain count: a whole number, not a size, gauge, weight, SKU, label ("#2") or list number.
//   4. Pack vocabulary left over is `unread`: container and count words (case, cs, ctn, bundle, bdl, bx,
//      pk, ct, count, qty, per, master, inner, outer, skid, sleeve, ea, each, pcs, dozen, gross,
//      packed…); words that also name products (box, bag, roll, pack, carton, pallet, tube, spool,
//      mailer…) next to a count, "/", a word of the first kind, "of N" or "x N"; "/" between a number and
//      a word, or next to a container word; "in a"/"in each"/"in box"; "of N"; a count glued to "s" ("500s", "500's"); a
//      stray count; a part of a number before a container ("½ case"). So "50 lb/bundle" is unread.
// A bare count (S3 "500 ct") is per the quantity's unit when that is a pack ("500 ct, 2 cases": 500 to a
// case); otherwise its kind is unknown, and it never equals an item's pack.

export interface StatedPack {
  count:number;
  /** What the pack is: bundle, case (a carton is a case), box, roll, pack, coil, bag, pallet, sleeve…; null: a bare count of unknown kind. */
  per:string|null;
  /** How the note names it: "50/bundle", "1,000/case", "500 ct". */
  text:string;
}

/** The distinct pack statements read from a line, and the pack wording read into none (as written; null: none). */
export interface PackReading {packs:StatedPack[];unread:string|null}

const NUMBER=new Intl.NumberFormat('en-US',{maximumFractionDigits:3});
const MAX_UNREAD=60;

// ---- Words ---------------------------------------------------------------------------------------------

const list=(text:string)=>text.split(' ');
const kinds=(kind:string,text:string)=>list(text).map(w=>[w,kind] as const);
/** Container words -> the kind of pack. */
const CONTAINER:ReadonlyMap<string,string>=new Map([
  ...kinds('bundle','bundle bundles bdl bdls bndl bndls'),
  ...kinds('case','case cases cs carton cartons ctn ctns'),
  ...kinds('box','box boxes bx bxs'),
  ...kinds('roll','roll rolls rl rls'),
  ...kinds('pack','pack packs pk pks pkg pkgs pkt pkts packet packets'),
  ...kinds('coil','coil coils'),
  ...kinds('bag','bag bags'),
  ...kinds('sleeve','sleeve sleeves'),
  ...kinds('tube','tube tubes'),
  ...kinds('spool','spool spools'),
  ...kinds('pallet','pallet pallets plt plts'),
  ...kinds('skid','skid skids'),
  ...kinds('bale','bale bales'),
]);
const CONTAINER_KINDS=new Set(CONTAINER.values());
/** Pieces: what a pack holds ("500 pcs/case", "case of 500 bags"). */
const PIECE=new Set(list('each ea pc pcs piece pieces ct cnt count unit units box boxes bx bxs bag bags mailer mailers envelope envelopes sheet sheets label labels pouch pouches roll rolls rl rls tube tubes'));
/** Bare counts (S3): the word -> its kind (null: a count of unknown kind). */
const BARE:ReadonlyMap<string,string|null>=new Map([['ct',null],['cnt',null],['count',null],['pk','pack'],['pack','pack'],['pkg','pack']]);
/** Always pack wording. */
const STRONG=new Set([
  ...list('bundle bundles bdl bdls bndl bndls case cases cs ctn ctns bx bxs pk pks pkg pkgs pkt pkts rl rls'),
  ...list('ct cts cnt count counts qty qtys quantity per master inner outer skid skids sleeve sleeves'),
  ...list('ea each pc pcs piece pieces dozen doz dz gross packed plt plts'),
]);
/** Pack wording only next to a count, "/", a STRONG word, "of N" or "x N", since they also name products ("Corrugated Boxes", "Folding Cartons", "Bubble Dispenser Packs"). */
const WEAK=new Set(list('box boxes carton cartons pack packs packet packets bag bags roll rolls coil coils tube tubes spool spools pallet pallets bale bales mailer mailers envelope envelopes sheet sheets label labels pouch pouches'));
/** Words after a number that make it a measure, not a count. */
const MEASURE=new Set(list('in inch inches mil mils ft feet foot mm cm yd yds yard yards lb lbs pound pounds oz gauge ga ect ply gal gallon gallons kg g l ml mic micron microns cu test wide long high deep thick dia'));
const MEASURE_MARK=new Set(['"','\'','′','″','”','’','%','#']);
const DIMENSION=new Set(['x','×','*']);
/** Words before a number that make it a label, not a count ("#2", "size 4", "item 3"). */
const LABEL=new Set(list('# no size model style item sku part grade type ref po line number num'));
/** Quantity labels ("qty 10 bundles", "x 10"). */
const QTY_LABEL=new Set(['qty','quantity','x','×']);
/** Marks skipped when looking for a neighbour ("12-pack", "case: 500", "(500)"). */
const SOFT=new Set(['-','–','—',':','(',')','.','=']);
const SEPARATOR=new Set(['/','per','a','an']);
/** "in a case", "in each box", "in the carton". */
const IN_WORDS=new Set(['a','an','each','every','the']);
const EACH=new Set(list('each ea pc pcs piece pieces'));
/** Product nouns a quantity in pieces may be written in ("500 boxes" of a quantity in each). */
const NOUN=new Set(list('box bag pouch mailer envelope roll sheet label coil tube'));
/** BOXT's price tiers: "bundle pricing", "pallet pricing" (no pack count). */
const TIER=new Set(list('bundle pallet case'));

/** A unit word as one name: "cases"/"cs"/"carton" -> case, "pcs" -> each, "boxes" -> box, "mailers" -> mailer. */
export function unitName(word:string|null|undefined):string|null{
  const w=(word??'').trim().toLowerCase().replace(/\.$/,'');
  if(!w)return null;
  if(EACH.has(w))return 'each';
  const kind=CONTAINER.get(w);
  if(kind)return kind;
  return w.replace(/(x|ch|sh)es$/,'$1').replace(/(?<=[a-z]{2})s$/,'');
}

// ---- Tokens --------------------------------------------------------------------------------------------

interface Token {
  type:'num'|'word'|'mark';
  /** As written (after NFKC). */
  raw:string;
  low:string;
  start:number;
  end:number;
  value:number;
  /** No space before it. */
  glued:boolean;
}

const TOKEN=/\d{1,3}(?:,\d{3})+(?!\d)|\d+(?:\.\d+)?|[a-z]+|\S/giu;

function tokenize(text:string):{text:string;tokens:Token[]}{
  const normal=text.normalize('NFKC').replace(/[\u200B-\u200D\u2060\uFEFF\u00AD]/g,'').replace(/[\u2044\u2215\u00F7\u29F8]/g,'/');
  const tokens:Token[]=[];
  for(const m of normal.matchAll(TOKEN)){
    const raw=m[0],start=m.index;
    const type=/^\d/.test(raw)?'num':/^[a-z]/i.test(raw)?'word':'mark';
    const prev=tokens.at(-1);
    tokens.push({type,raw,low:raw.toLowerCase(),start,end:start+raw.length,value:type==='num'?Number(raw.replace(/,/g,'')):NaN,glued:prev!==undefined&&prev.end===start});
  }
  return {text:normal,tokens};
}

// ---- Reading one text ----------------------------------------------------------------------------------

interface Found {pack:StatedPack;tokens:number[]}

class Text {
  readonly tokens:Token[];
  readonly text:string;
  /** Tokens the quantity, a price tier or a statement used. */
  private readonly used=new Set<number>();
  /** The quantity's unit token, also the container of "2 cases of 500". */
  private unitToken=-1;

  constructor(raw:string){
    const {text,tokens}=tokenize(raw);
    this.text=text;
    this.tokens=tokens;
  }

  private at=(i:number):Token|undefined=>this.tokens[i];
  private low=(i:number)=>this.tokens[i]?.low??'';
  private free=(i:number)=>i>=0&&i<this.tokens.length&&!this.used.has(i);
  /** An abbreviation's dot ("pc.", "cs."): the grammar skips it. */
  private isDot=(i:number)=>this.low(i)==='.'&&this.at(i)!.glued&&this.at(i-1)?.type==='word';
  /** The next index after i that is not an abbreviation's dot. */
  private next(i:number){
    let j=i+1;
    while(j<this.tokens.length&&this.isDot(j))j++;
    return j;
  }
  private use(...indices:number[]){
    for(const i of indices)this.used.add(i);
  }
  private packWord=(w:string)=>STRONG.has(w)||WEAK.has(w)||CONTAINER.has(w)||PIECE.has(w)||BARE.has(w);

  /** A number glued to a "," or "." and another number ("5,00", "1,0000"): malformed, never a count. */
  private fragment(i:number):boolean{
    const t=this.at(i)!,before=this.at(i-1),after=this.at(i+1);
    if(before&&t.glued&&(before.low===','||before.low==='.')&&before.glued&&this.at(i-2)?.type==='num')return true;
    return !!after&&after.glued&&(after.low===','||after.low==='.')&&this.at(i+2)?.type==='num'&&this.at(i+2)!.glued;
  }

  /** A size or measure: a side of a dimension ("12x10", "18\" x 1500'"), before a measure word or mark, or one side of a fraction. */
  private measured(i:number):boolean{
    const nxt=this.at(i+1);
    if(this.dimension(i))return true;
    if(nxt&&(MEASURE.has(nxt.low)||MEASURE_MARK.has(nxt.low)))return !this.inPack(i+1);
    return this.fraction(i);
  }
  /**
   * A side of a size: x/× between two numbers (a number may carry its inch or foot mark), at most three
   * sides. "x500" after a word, a fourth side ("10x4x4 x6") and "4 x6" (x glued to the number after it
   * only) are counts, not sizes.
   */
  private dimension(i:number):boolean{
    const sides=(j:number)=>{
      // The numbers of the size chain ending at token j (a number), counted backwards.
      let n=1;
      for(;;){
        const x=j-1;
        if(!DIMENSION.has(this.low(x))||!this.joins(x))return n;
        // The side before x may carry its unit: 18" x, 48mm x, 2 m x.
        const prev=(MEASURE_MARK.has(this.low(x-1))||MEASURE.has(this.low(x-1))||this.low(x-1)==='m')&&this.at(x-2)?.type==='num'?x-2:x-1;
        if(this.at(prev)?.type!=='num')return n;
        n++;
        j=prev;
      }
    };
    if(this.at(i)?.type!=='num')return false;
    const back=sides(i);
    if(back>3)return false;
    if(back>1)return true;
    const x=MEASURE_MARK.has(this.low(i+1))||MEASURE.has(this.low(i+1))||this.low(i+1)==='m'?i+2:i+1;
    return DIMENSION.has(this.low(x))&&this.joins(x)&&this.at(x+1)?.type==='num';
  }
  /** An x that joins two sides: spaced on both sides or on neither ("4 x6" is a multiplier). */
  private joins=(x:number)=>{
    const t=this.at(x),after=this.at(x+1);
    return !!t&&!!after&&t.glued===after.glued;
  };
  /** "in" that says where pieces are packed ("in a case", "in box"), not inches. */
  private inPack=(i:number)=>this.low(i)==='in'&&(IN_WORDS.has(this.low(i+1))||CONTAINER.has(this.low(i+1)));
  private fraction=(i:number)=>(this.low(i+1)==='/'&&this.at(i+2)?.type==='num')||(this.low(i-1)==='/'&&this.at(i-2)?.type==='num');

  /** A plain count: a whole number ≥ 1 that is not a size, measure, label ("#2"), SKU ("PB3866", "S-4128") or list number ("1."); "500set", "500x" are counts. */
  private count(i:number):boolean{
    const t=this.at(i);
    if(!t||t.type!=='num'||!Number.isSafeInteger(t.value)||t.value<1||t.low.includes('.')||this.fragment(i)||this.measured(i))return false;
    const prev=this.at(i-1),nxt=this.at(i+1);
    if(prev&&LABEL.has(prev.low))return false;
    // A SKU: capitals glued to it ("PB3866", "S-4128"), unless they are pack wording ("CS500", "CTN-500").
    const word=prev&&t.glued&&prev.type==='word'?prev:prev&&t.glued&&prev.low==='-'&&prev.glued&&this.at(i-2)?.type==='word'?this.at(i-2)!:null;
    if(word&&/^[A-Z]+$/.test(word.raw)&&!this.packWord(word.low)&&!MEASURE.has(word.low))return false;
    if(i===0&&nxt&&(nxt.low==='.'||nxt.low===')'))return false;
    return true;
  }

  // ---- 2. The quantity and the price tiers ----

  takeQuantity(quantity:number|null,unit:string|null){
    this.tokens.forEach((t,i)=>{
      if(TIER.has(t.low)&&this.low(i+1)==='pricing')this.use(i,i+1);
    });
    if(quantity===null)return;
    const want=unitName(unit);
    const candidates=this.tokens.flatMap((t,i)=>{
      if(t.type!=='num'||t.value!==quantity||this.fragment(i)||!this.free(i))return [];
      const nxt=this.at(i+1);
      if(nxt&&((DIMENSION.has(nxt.low)&&this.at(i+2)?.type==='num')||MEASURE.has(nxt.low)||MEASURE_MARK.has(nxt.low)))return [];
      return nxt?.low==='/'&&this.at(i+2)?.type==='num'?[]:[i];
    });
    const labelOf=(i:number)=>{
      let k=i-1;
      while(k>=0&&[':','#','=','.'].includes(this.low(k)))k--;
      return k>=0&&QTY_LABEL.has(this.low(k))?k:-1;
    };
    // The number with its unit word after it: the nearest, then the last.
    let best:{at:number;unit:number;distance:number}|null=null;
    if(want)for(const c of candidates){
      let j=c+1,distance=0;
      if(SOFT.has(this.low(j))&&this.low(j)!=='.')j++;
      while(j<this.tokens.length&&distance<=3){
        const t=this.at(j)!;
        if(t.type!=='word'||!this.free(j))break;
        const name=unitName(t.low);
        if(name===want||(want==='each'&&NOUN.has(name??''))){
          if(!best||distance<=best.distance)best={at:c,unit:j,distance};
          break;
        }
        if(this.packWord(t.low)||MEASURE.has(t.low))break;
        j++;
        distance++;
      }
    }
    let at=best?.at??-1;
    if(at<0){
      // The number alone: labelled, else first or last in the text.
      const content=this.tokens.flatMap((t,i)=>t.type==='mark'?[]:[i]);
      at=candidates.filter(c=>labelOf(c)>=0).at(-1)??candidates.find(c=>c===content.at(-1)||c===content[0])??-1;
    }
    if(at<0)return;
    this.use(at);
    const label=labelOf(at);
    if(label>=0)for(let k=label;k<at;k++)this.use(k);
    if(best&&best.at===at){
      this.use(best.unit);
      this.unitToken=best.unit;
      if(this.isDot(best.unit+1))this.use(best.unit+1);
    }
  }

  // ---- 3. Statements ----

  readStatements(unit:string|null):StatedPack[]{
    const packs:StatedPack[]=[];
    for(let i=0;i<this.tokens.length;i++){
      const found=this.s1(i)??this.s2(i)??this.s3(i,unit);
      if(!found)continue;
      this.use(...found.tokens);
      packs.push(found.pack);
      i=Math.max(...found.tokens);
    }
    return packs;
  }

  private statement(count:number,per:string|null,tokens:number[],bare:boolean):Found{
    return {pack:{count,per,text:bare?`${NUMBER.format(count)} ct`:`${NUMBER.format(count)}/${per}`},tokens};
  }
  /** The dot after an abbreviation at i, if any, with i. */
  private withDot=(i:number)=>this.isDot(i+1)?[i,i+1]:[i];

  /** S1: N [piece] (/|per|a|an) CONTAINER */
  private s1(i:number):Found|null{
    if(!this.free(i)||!this.count(i))return null;
    const tokens=[i];
    let j=i+1;
    if(this.free(j)&&this.low(j)==='-'&&this.at(j)!.glued){
      tokens.push(j);
      j++;
    }
    if(this.free(j)&&PIECE.has(this.low(j))&&SEPARATOR.has(this.low(this.next(j)))){
      tokens.push(...this.withDot(j));
      j=this.next(j);
    }
    if(!this.free(j)||!SEPARATOR.has(this.low(j)))return null;
    tokens.push(j);
    const k=this.next(j);
    const kind=CONTAINER.get(this.low(k));
    if(!this.free(k)||!kind)return null;
    tokens.push(...this.withDot(k));
    return this.statement(this.at(i)!.value,kind,tokens,false);
  }

  /** S2: CONTAINER of N [piece]; the container may be the quantity's unit ("2 cases of 500"). */
  private s2(i:number):Found|null{
    const kind=CONTAINER.get(this.low(i));
    if(!kind||!(this.free(i)||i===this.unitToken))return null;
    const of=this.next(i),n=of+1;
    if(!this.free(of)||this.low(of)!=='of'||!this.free(n)||!this.count(n))return null;
    const tokens=i===this.unitToken?[of,n]:[...this.withDot(i),of,n];
    const p=n+1;
    if(this.free(p)&&PIECE.has(this.low(p)))tokens.push(...this.withDot(p));
    return this.statement(this.at(n)!.value,kind,tokens,false);
  }

  /** S3: N[-](ct|cnt|count|pk|pack|pkg); a bare count is per the quantity's unit when that is a pack. */
  private s3(i:number,unit:string|null):Found|null{
    if(!this.free(i)||!this.count(i))return null;
    const tokens=[i];
    let j=i+1;
    if(this.free(j)&&this.low(j)==='-'){
      tokens.push(j);
      j++;
    }
    if(!this.free(j)||!BARE.has(this.low(j)))return null;
    // "500 ct box", "case 500 ct": a container right after it (or a case word before it) makes it a pack this grammar does not read.
    if(CONTAINER.has(this.low(this.next(j)))||(CONTAINER.has(this.low(i-1))&&STRONG.has(this.low(i-1))))return null;
    tokens.push(...this.withDot(j));
    const own=BARE.get(this.low(j))!;
    if(own!==null)return this.statement(this.at(i)!.value,own,tokens,false);
    const quantityUnit=unitName(unit);
    return this.statement(this.at(i)!.value,quantityUnit&&CONTAINER_KINDS.has(quantityUnit)?quantityUnit:null,tokens,true);
  }

  // ---- 4. Vocabulary left over ----

  /** The neighbour of i in a direction, skipping soft marks; -1 at an end or at a used token (a boundary). */
  private neighbour(i:number,step:1|-1):number{
    let j=i+step;
    while(this.free(j)&&SOFT.has(this.low(j)))j+=step;
    return this.free(j)?j:-1;
  }

  unread():string|null{
    const out=new Set<number>();
    // Any number that is not a size or a measure (a count, a SKU's digits, a part of a number), or "/".
    const triggers=(j:number)=>j>=0&&((this.at(j)!.type==='num'&&!this.measured(j))||this.low(j)==='/');
    this.tokens.forEach((t,i)=>{
      if(!this.free(i))return;
      const w=t.low;
      if(t.type==='word'){
        if(STRONG.has(w))out.add(i);
        else if(this.inPack(i))out.add(i).add(i+1);
        else if(w==='of'&&this.free(i+1)&&this.at(i+1)?.type==='num')out.add(i);
        else if(w==='s'&&t.glued&&this.at(i-1)?.type==='num')out.add(i-1).add(i);
        else if(w==='s'&&t.glued&&['\'','’'].includes(this.low(i-1))&&this.at(i-2)?.type==='num')out.add(i-2).add(i-1).add(i);
        else if(WEAK.has(w)){
          const after=this.neighbour(i,1);
          if(triggers(this.neighbour(i,-1))||triggers(after)
            ||(this.low(after)==='of'&&this.at(after+1)?.type==='num')
            ||(DIMENSION.has(this.low(i+1))&&this.count(i+2)))out.add(i);
        }
        return;
      }
      if(t.type==='mark'){
        if(w!=='/')return;
        const a=this.at(i-1),b=this.at(i+1);
        const numberAndWord=!!a&&!!b&&((a.type==='num'&&b.type==='word')||(a.type==='word'&&b.type==='num'));
        if(numberAndWord||(a&&CONTAINER.has(a.low))||(b&&CONTAINER.has(b.low)))out.add(i);
        return;
      }
      // Numbers: a stray count, or a part of a number right before a container word ("½ case", "0.5 cs").
      const nxt=this.at(i+1)?.low??'';
      if(this.count(i)||((t.low.includes('.')||this.fraction(i))&&(CONTAINER.has(nxt)||STRONG.has(nxt))))out.add(i);
    });
    return this.excerpt([...out].sort((a,b)=>a-b));
  }

  /** Tokens as written: runs of nearby tokens, widened to glued marks and adjacent free numbers. */
  private excerpt(indices:number[]):string|null{
    if(!indices.length)return null;
    const runs:[number,number][]=[];
    for(const i of indices){
      const last=runs.at(-1);
      if(last&&i-last[1]<=2)last[1]=i;
      else runs.push([i,i]);
    }
    const widen=(k:number,step:1|-1)=>{
      for(;;){
        const j=k+step,t=this.at(j);
        if(!t||t.low===','||t.low===';')return k;
        const glued=step===1?t.glued:this.tokens[k].glued;
        if(glued||(t.type==='num'&&this.free(j)&&!this.dimension(j)))k=j;
        else return k;
      }
    };
    return runs.map(([a,b])=>this.text.slice(this.tokens[widen(a,-1)].start,this.tokens[widen(b,1)].end).trim()).join(', ');
  }
}

/**
 * The pack wording of a customer's line: its description (as parsed) and its raw text, with the parsed
 * quantity and unit (never read as a pack). See the top of this file.
 */
export function readPacks(description:string|null|undefined,rawText:string|null|undefined,quantity:number|null,unit:string|null):PackReading{
  const packs:StatedPack[]=[];
  const unread:string[]=[];
  // The description is read on its own only when the parser rewrote it: a part of the raw line is read with it.
  const contained=!!description&&!!rawText&&rawText.normalize('NFKC').toLowerCase().includes(description.normalize('NFKC').trim().toLowerCase());
  for(const source of contained?[rawText]:[description,rawText]){
    if(!source?.trim())continue;
    const text=new Text(source);
    text.takeQuantity(quantity,unit);
    for(const pack of text.readStatements(unit))if(!packs.some(p=>p.count===pack.count&&p.per===pack.per))packs.push(pack);
    const words=text.unread();
    if(words&&!unread.includes(words))unread.push(words);
  }
  const joined=unread.join(', ');
  return {packs,unread:!joined?null:joined.length>MAX_UNREAD?`${joined.slice(0,MAX_UNREAD-1).trimEnd()}…`:joined};
}
