import {extractText,getDocumentProxy} from 'unpdf';

// Tests only: reads a PDF's text the way a customer's viewer would (pdf.js, via unpdf).

/** Every page's text, whitespace collapsed to single spaces, and the page count. */
export async function pdfText(bytes:Uint8Array|ArrayBuffer){
  const pdf=await getDocumentProxy(new Uint8Array(bytes.slice(0)));
  const {totalPages,text}=await extractText(pdf,{mergePages:true});
  return {pages:totalPages,text:text.replace(/\s+/g,' ').trim()};
}

const amount=new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const escape=(s:string)=>s.replace(/[.,$]/g,m=>`\\${m}`);

/**
 * What must never appear on a customer PDF (spec §6.7): each line's unit cost and cost total, as
 * dollars and as bare numbers, and the words and marks of cost, margin, floors, price basis and
 * Querent's reasoning. Returns the offending matches, so a failure names them.
 */
export function internalLeaks(text:string,lines:readonly {qty:number;unit_cost:number;explanation:string|null}[]){
  const found:string[]=[];
  for(const l of lines){
    for(const value of [l.unit_cost,Math.round(l.qty*l.unit_cost*100)/100]){
      // "21.40" or "1,021.40", alone or after "$", but not inside another number ("121.40").
      for(const shown of new Set([value.toFixed(2),amount.format(value)])){
        const hit=text.match(new RegExp(`(?<![\\d.,])${escape(shown)}(?!\\d)`));
        if(hit)found.push(`cost value ${hit[0]}`);
      }
    }
    if(l.explanation&&text.includes(l.explanation.slice(0,24)))found.push(`Querent's note "${l.explanation.slice(0,24)}…"`);
  }
  const WORDS=[/\bcosts?\b/i,/margin/i,/\bfloors?\b/i,/\bGP\b/,/%/,/why this price/i,/querent found/i,/suggest/i,/\bbasis\b/i,/\blast paid\b/i,/\blist price\b/i,/\bcontract\b/i,/internal/i,/confidential/i];
  for(const word of WORDS){const hit=text.match(word);if(hit)found.push(`"${hit[0]}"`);}
  return found;
}
