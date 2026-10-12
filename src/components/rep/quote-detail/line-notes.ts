import type {FloorContext} from '@/server/floors';
import {CONFIDENCE} from '@/server/matching/score';
import {lineFigures,stockText,type DetailLine} from '@/server/rep/quote-math';

// The inline notes on a quote line (decision 44; plan U4). The "things to check before sending" box is
// gone; its warnings that the frames don't place show on their line instead, styled like the
// below-floor note: stock short at the quote branch (with the other branches and what is on order), and
// a SKU match below the confident score (CONFIDENCE.minScore, 0.75). Neither blocks the send.

export interface LineNote {kind:'stock'|'match';text:string}

const capital=(text:string)=>text.charAt(0).toUpperCase()+text.slice(1);

export function lineNotes(line:DetailLine,floor:FloorContext):LineNote[]{
  const notes:LineNote[]=[];
  const {stock}=lineFigures(line,floor);
  if(stock.short>0)notes.push({kind:'stock',text:capital(stockText(stock))});
  if(line.match_score!==null&&line.match_score<CONFIDENCE.minScore)notes.push({kind:'match',text:`Confirm the match for "${line.requested_text??line.sku}"`});
  return notes;
}
