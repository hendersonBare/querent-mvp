// Request lines (spec §3, carried from task 1.4): the SKU scorer (src/server/matching) scores ONE line
// of a request with its quantity taken out. A customer's message, or what Claude passes to
// search_items, can hold several lines ("10 boxes of the 1/2 in grade 8 hex bolts and 6 boxes of
// cut-off wheels"), so it is split here first, and each line's qty is read and stripped.
//
// Splitting is deliberately cautious: a new line starts at a line break, a semicolon, a bullet or a
// sentence end, and at a comma / "and" / "plus" / "&" only when a count follows. So "nuts and
// washers" stays one line, while "bolts and 6 cut-off wheels" becomes two.

/** One line of a request. `text` is what the scorer sees; `said` is the customer's words for it. */
export interface RequestLine {said:string;text:string;qty:number|null}

const UNITS='boxes|box|bx|cases?|cs|packs?|pks?|pkgs?|packages?|each|ea|pcs|pieces?|rolls?|pairs?|prs?|units?|bags?|cartons?|ctns?|bundles?|dozen|doz';
/** "10 boxes", "6 bx", "12 each": a count with a selling unit. "1/2 in" and "4.5" are sizes, never a count. */
export const UNIT_QTY=new RegExp(String.raw`(?<![\d/.\-#])(\d{1,4})\s*(?:${UNITS})\b(?:\s+of\b)?`,'i');
/** Units of measure: a number before one of these is a size ("2 in", "30 ft"), not a count. */
const MEASURE_UNITS=String.raw`x|by|in|inch|inches|ft|feet|foot|mm|cm|m|yd|yds|yards?|gal|gallons?|lbs?|pounds?|oz|mil|grit|ga|gauge|ply|psi|v|volts?|amps?|w|"|'`;
/** Request words that can come before a count: "please quote 10 ...", "can you send 12 of ...". */
const LEAD_IN=String.raw`(?:(?:please|pls|can\s+you|could\s+you|would\s+you|i'd|we'd|i'll|we'll|i|we|like|would|will|need|want|order|quote|send|get|me|us|also|and|plus|then|add|take|another|more)\s+)*`;
/** A leading count: "6 cut-off wheels", "12 of the straps". Not "2 in hex bolts" or "30 ft straps". */
const LEADING_QTY=new RegExp(String.raw`^${LEAD_IN}(\d{1,4})(?![\d/.\-])\s*(?:of\b\s*)?(?!(?:${MEASURE_UNITS})(?![a-z]))(?=[a-z(])`,'i');
const LEADING_UNIT_QTY=new RegExp(String.raw`^${LEAD_IN}${UNIT_QTY.source}`,'i');
const ONLY_LEAD_IN=new RegExp(String.raw`^\s*${LEAD_IN}$`,'i');
/** "qty 6", "quantity: 6". */
const LABELLED_QTY=/\b(?:qty|quantity)\s*:?\s*(\d{1,4})\b/i;

/** Abbreviations whose period doesn't end a sentence: "1/2 in. grade 8". */
const ABBREVIATION=String.raw`(?<!\b(?:in|ft|no|qty|pcs?|approx|ea|lbs?|oz|gal|yds?|dia|ga|mm|cm|x|vs|etc|st|dr|mr|ms|mrs))`;
/** Hard breaks always start a new line: line breaks, semicolons, bullets, sentence ends (not a decimal point). */
const HARD=new RegExp(String.raw`\r?\n|;|•|${ABBREVIATION}(?<=[a-z)\]])\.(?=\s|$)|[!?]`,'i');
/** Soft breaks start a new line only when a count follows. The separator is kept so a rejoined line reads as typed. */
const SOFT=/(\s*,\s*|\s*&\s*|\s+and\s+|\s+plus\s+)/i;
const BULLET=/^\s*(?:[-*]|\d{1,2}[.)])\s+/;

const count=(raw:string|undefined)=>{const n=raw===undefined?NaN:Number(raw);return Number.isInteger(n)&&n>0?n:null;};
const tidy=(text:string)=>text.replace(/\s+/g,' ').replace(/^[\s,.:;&-]+|[\s,:;&-]+$/g,'').replace(/^(?:and|plus)\s+/i,'').trim();

/** The qty stated in one line, or null: "10 boxes", "qty 6", or a leading count. */
export function quantityOf(line:string):number|null{
  const text=line.replace(BULLET,'');
  return count(UNIT_QTY.exec(text)?.[1])??count(LABELLED_QTY.exec(text)?.[1])??count(LEADING_QTY.exec(text)?.[1]);
}

/** The line with its qty phrase (and any request words before it) taken out, ready to score. */
export function withoutQty(line:string){
  let text=line.replace(BULLET,'');
  const unit=UNIT_QTY.exec(text);
  if(unit){
    const before=text.slice(0,unit.index);
    // "Please quote 10 boxes of ..." loses its lead-in with the count; "hex bolts, 10 boxes" keeps its words.
    text=`${ONLY_LEAD_IN.test(before)?'':before} ${text.slice(unit.index+unit[0].length)}`;
  }else if(LABELLED_QTY.test(text))text=text.replace(LABELLED_QTY,' ');
  else{
    const leading=LEADING_QTY.exec(text);
    if(leading)text=text.slice(leading[0].length);
  }
  return tidy(text);
}

const startsWithQty=(piece:string)=>LEADING_QTY.test(piece)||LEADING_UNIT_QTY.test(piece);

/** Splits a request into its lines, each with its qty read and stripped. Pieces with no item words are dropped. */
export function splitRequest(request:string):RequestLine[]{
  const lines:string[]=[];
  for(const hard of request.split(HARD)){
    const parts=(hard??'').replace(BULLET,'').split(SOFT);
    let current=parts[0]??'';
    for(let i=1;i<parts.length;i+=2){
      const separator=parts[i],piece=parts[i+1]??'';
      // A count starts a new line, unless it is all the piece says ("hex bolts, 10 boxes").
      if(current.trim()&&startsWithQty(piece)&&withoutQty(piece)){lines.push(current);current=piece;}
      else current+=separator+piece;
    }
    lines.push(current);
  }
  return lines.map(tidy).filter(Boolean).flatMap(said=>{
    const text=withoutQty(said);
    return text?[{said,text,qty:quantityOf(said)}]:[];
  });
}
