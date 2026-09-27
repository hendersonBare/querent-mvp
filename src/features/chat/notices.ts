import type {QuoteNotice} from '@/domain';
import type {ChatTurn} from '@/lib/contracts';

// Where the "quote is ready" messages (task 5.1) go among the chat's turns. They aren't turns
// (history() has no row for them), so the chat keeps them apart and interleaves them when it
// renders. A notice loaded with the history goes after the turns logged before it; one that
// arrives later (the chat polls for them) goes after the turns on screen when it arrived.

/** How often the chat looks for a newly sent quote: as often as the quotes sidebar refreshes (task 2.4). */
export const NOTICE_POLL_MS=5000;

/** A notice and its place: the number of turns shown before it. */
export interface PlacedNotice {notice:QuoteNotice;after:number}

/** Places notices loaded with `turns` (the history, oldest first): each after every turn logged at or before it. */
export function placeWithHistory(turns:readonly ChatTurn[],notices:readonly QuoteNotice[]):PlacedNotice[]{
  return notices.map(notice=>{
    const later=turns.findIndex(turn=>turn.timestamp!==undefined&&turn.timestamp>notice.created_at);
    return {notice,after:later<0?turns.length:later};
  });
}

/**
 * Adds the notices in `fetched` that aren't shown yet, after the `turnCount` turns on screen now.
 * Returns `placed` itself when nothing is new, so polling doesn't re-render. A notice never moves or
 * disappears once shown.
 */
export function addArrived(placed:readonly PlacedNotice[],fetched:readonly QuoteNotice[],turnCount:number):PlacedNotice[]{
  const shown=new Set(placed.map(p=>p.notice.id));
  const arrived=fetched.filter(n=>!shown.has(n.id));
  return arrived.length?[...placed,...arrived.map(notice=>({notice,after:turnCount}))]:placed as PlacedNotice[];
}

export type TimelineEntry={kind:'turn';turn:ChatTurn;index:number}|{kind:'notice';notice:QuoteNotice};

/** The turns and notices in the order the chat shows them. A notice placed past the last turn (one was withdrawn) goes last. */
export function timeline(turns:readonly ChatTurn[],placed:readonly PlacedNotice[]):TimelineEntry[]{
  const entries:TimelineEntry[]=[];
  for(let index=0;index<=turns.length;index++){
    for(const p of placed)if(Math.min(p.after,turns.length)===index)entries.push({kind:'notice',notice:p.notice});
    if(index<turns.length)entries.push({kind:'turn',turn:turns[index],index});
  }
  return entries;
}
