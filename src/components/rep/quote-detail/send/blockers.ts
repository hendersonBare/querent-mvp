import type {SendBlocker} from '@/server/quotes';

// Send blockers in the quote editor (decision 44; plan U4). The checks box is gone, so Approve and send
// is disabled while sendBlockers() (src/server/quotes/send-check.ts) finds anything, the first blocker is
// named under it in red with "+N more", and clicking that text jumps to the line or field at fault.
// The server still refuses a blocked send (send_blocked, 422). No frame draws this state (status.md,
// "No frame").

/** Where a blocker is fixed: a line's field, a Quote details section, or + Add item. */
export type BlockerTarget=
  |{kind:'line';lineId:string;field:'qty'|'price'}
  |{kind:'details';section:'fulfillment'|'freight'|'terms'}
  |{kind:'add-item'};

export function blockerTarget(blocker:SendBlocker):BlockerTarget{
  switch(blocker.code){
    case 'zero_qty':return {kind:'line',lineId:blocker.line_id!,field:'qty'};
    case 'no_price':return {kind:'line',lineId:blocker.line_id!,field:'price'};
    case 'no_ship_to':return {kind:'details',section:'fulfillment'};
    case 'call_for_freight':return {kind:'details',section:'freight'};
    case 'expiration_passed':return {kind:'details',section:'terms'};
    case 'no_lines':return {kind:'add-item'};
  }
}

/** The line under Approve and send: the first blocker's message, and "+N more" for the rest. Null when nothing blocks. */
export function blockerSummary(blockers:readonly SendBlocker[]):{first:string;more:string|null}|null{
  if(!blockers.length)return null;
  return {first:blockers[0].message,more:blockers.length>1?`+${blockers.length-1} more`:null};
}
