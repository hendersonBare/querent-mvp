import {createHash} from 'node:crypto';
import {PDF_FIXTURES} from './fixtures/pdf';
import {MAX_PDF_BYTES,PDF_TOO_LARGE_ERROR,rowsResult,TOO_MANY_ROWS_ERROR,MAX_ROWS} from './rows';
import type {ParsedRow,Parser} from './types';

// The scripted parser (QUERENT_SCRIPTED=1, or no API key): deterministic and offline. Text is one row
// per non-empty line, with a leading or trailing supplier SKU (S-4128, H-123) and the quantity
// (10, qty 10, 10 cs, x 10, 10 cases, …) taken out of the description. A PDF is read from its
// hand-written fixture in fixtures/pdf, keyed by the file's sha256; any other PDF is refused.

export const PDF_FIXTURE_MISSING_ERROR='Could not read that PDF. Try pasting the list as text.';

export function sha256Hex(data:Uint8Array):string{
  return createHash('sha256').update(data).digest('hex');
}

const UNITS:Record<string,string>={
  cs:'case',case:'case',cases:'case',
  bdl:'bundle',bdls:'bundle',bundle:'bundle',bundles:'bundle',
  ea:'each',each:'each',pc:'each',pcs:'each',piece:'each',pieces:'each',
  rl:'roll',rls:'roll',roll:'roll',rolls:'roll',
  pk:'pack',pks:'pack',pack:'pack',packs:'pack',
  ctn:'carton',ctns:'carton',carton:'carton',cartons:'carton',
  plt:'pallet',plts:'pallet',pallet:'pallet',pallets:'pallet',
};
const UNIT=`(${Object.keys(UNITS).sort((a,b)=>b.length-a.length).join('|')})`;
const NUM='(\\d+(?:\\.\\d+)?)';
const SEP='[\\s,;:|\\-–—]';
/** Words after a leading number that make it a size, not a quantity ("3 inch tape", "2 mil bags"). */
const MEASURE='(?:"|\'|in\\b|inch|inches|mil\\b|mils\\b|ft\\b|feet|foot|mm\\b|cm\\b|m\\b|yd|yds|yard|yards|lb|lbs|#|oz\\b|gauge|ga\\b|ect\\b|ply\\b|x\\b|×|/|%)';

/** Three dimensions, as in 12x10x8 or 12" x 10" x 8. */
const DIM3='\\d+(?:\\.\\d+)?"?\\s*[x×]\\s*\\d+(?:\\.\\d+)?"?\\s*[x×]\\s*\\d';
const SKU='[A-Z]{1,3}-\\d{2,6}[A-Z]{0,3}';
const LEADING_SKU=new RegExp(`^[(\\[]?(${SKU})[)\\]]?(?=${SEP}|$)`);
const TRAILING_SKU=new RegExp(`(?:^|${SEP})[(\\[]?(${SKU})[)\\]]?$`);
const LIST_MARKER=/^(?:[-*•·]|\d{1,3}[.)])\s+/;

/** Quantity patterns, tried in order; the first that matches is taken out of the line. */
const QUANTITY:RegExp[]=[
  new RegExp(`(?:^|${SEP}|\\()(?:qty|quantity)\\.?\\s*[:=#]?\\s*${NUM}(?:\\s*${UNIT}\\b\\.?)?\\)?`,'i'),
  // "10 x Boxes" or "10 x 12x10x8 boxes", but not the spaced dimensions "12 x 10 x 8".
  new RegExp(`^${NUM}\\s*[x×]\\s+(?=[^\\d]|${DIM3})`,'i'),
  new RegExp(`^${NUM}\\s*${UNIT}\\b\\.?\\s*(?:of\\s+)?`,'i'),
  new RegExp(`^${NUM}(?=\\s)(?!\\s*${MEASURE})\\s+`,'i'),
  new RegExp(`${SEP}+${NUM}\\s*${UNIT}\\.?$`,'i'),
  new RegExp(`(?<![\\d"'.\\s])\\s+[x×]\\s*${NUM}$`,'i'),
  new RegExp(`(?<![x×*/]${SEP}*)${SEP}+${NUM}$`,'i'),
];

const trimSeparators=(text:string)=>text.replace(new RegExp(`^${SEP}+|${SEP}+$`,'g'),'');

function takeSku(text:string):{text:string;sku:string|null}{
  const lead=text.match(LEADING_SKU);
  if(lead)return {text:trimSeparators(text.slice(lead[0].length)),sku:lead[1]};
  const trail=text.match(TRAILING_SKU);
  if(trail)return {text:trimSeparators(text.slice(0,trail.index)),sku:trail[1]};
  return {text,sku:null};
}

function takeQuantity(text:string):{text:string;quantity:number|null;unit:string|null;found:boolean}{
  for(const pattern of QUANTITY){
    const match=text.match(pattern);
    if(!match)continue;
    const value=Number(match[1]);
    const rest=trimSeparators(`${text.slice(0,match.index)} ${text.slice(match.index!+match[0].length)}`.replace(/\s+/g,' '));
    return {text:rest,quantity:value>0?value:null,unit:match[2]?UNITS[match[2].toLowerCase()]??null:null,found:true};
  }
  return {text,quantity:null,unit:null,found:false};
}

/** One line of a pasted list as a row, or null for a blank line. */
export function parseLine(line:string):ParsedRow|null{
  const rawText=line.trim();
  if(!rawText)return null;
  let text=trimSeparators(rawText.replace(LIST_MARKER,''));
  const first=takeSku(text);
  const quantity=takeQuantity(first.text);
  const second=first.sku?{text:quantity.text,sku:first.sku}:takeSku(quantity.text);
  text=trimSeparators(second.text);
  return {
    rawText,
    description:text||rawText,
    quantity:quantity.quantity,
    unit:quantity.quantity===null?null:quantity.unit,
    suppliersSku:second.sku,
    quantityUnclear:quantity.quantity===null,
  };
}

export interface ScriptedParserOptions {
  /** sha256 of the PDF → its rows. Defaults to the hand-written fixtures in fixtures/pdf. */
  pdfFixtures?:Record<string,ParsedRow[]>;
}

export function createScriptedParser({pdfFixtures=PDF_FIXTURES}:ScriptedParserOptions={}):Parser{
  return {
    async parse(input){
      if(input.kind==='pdf'){
        if(input.data.byteLength>MAX_PDF_BYTES)return {ok:false,error:PDF_TOO_LARGE_ERROR};
        const rows=pdfFixtures[sha256Hex(input.data)];
        return rows?rowsResult({rows}):{ok:false,error:PDF_FIXTURE_MISSING_ERROR};
      }
      const rows=input.text.split(/\r?\n|\r/).map(parseLine).filter((row):row is ParsedRow=>row!==null);
      if(rows.length>MAX_ROWS)return {ok:false,error:TOO_MANY_ROWS_ERROR};
      return {ok:true,rows};
    },
  };
}
