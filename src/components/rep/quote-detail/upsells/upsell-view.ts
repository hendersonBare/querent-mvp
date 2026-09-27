import {formatMargin,margin} from '@/server/floors';
import type {RepUpsell} from '@/server/rep/quote-upsells';
import type {DetailLine} from '@/server/rep/quote-math';
import {formatUpsellSummary} from '@/server/upsells';
import {money} from '../format';

// What "Suggested by Querent" shows (task 3.6; spec §4, §5.5; mockup .sugbox): pure, so the page
// and its tests agree. The chips come from the server; between a save and the next list, the
// page drops any chip the lines already answer (its item is on the quote, its line has changed).

export type UpsellsStatus='loading'|'ready'|'error';

/** The chips that still apply to the lines on screen, in the server's order (best GP first). */
export function openUpsells(chips:readonly RepUpsell[],lines:readonly Pick<DetailLine,'id'|'item_id'|'qty'>[]):RepUpsell[]{
  const byId=new Map(lines.map(l=>[l.id,l]));
  return chips.filter(chip=>{
    if(!byId.has(chip.anchor.line_id))return false;
    const {action}=chip;
    if(action.type==='add_line')return !lines.some(l=>l.item_id===action.item_id);
    return byId.get(action.line_id)?.qty===action.from_qty;
  });
}

/** The chip's button: Add an item, or Apply a bump. */
export const takeVerb=(chip:Pick<RepUpsell,'action'>)=>chip.action.type==='add_line'?'Add':'Apply';

/** "5 at $19.95 · 50.9% margin", or for a bump "6 → 8 at $36.00 · 33.1% margin". */
export function chipFigures(chip:Pick<RepUpsell,'action'|'qty'|'unit_price'|'unit_cost'>){
  const qty=chip.action.type==='set_qty'?`${chip.action.from_qty} → ${chip.action.to_qty}`:String(chip.qty);
  return `${qty} at ${money(chip.unit_price)} · ${formatMargin(margin(chip.unit_price,chip.unit_cost))} margin`;
}

/** "+$50.75 GP" */
export const chipGain=(chip:Pick<RepUpsell,'gp_gain'>)=>`+${money(chip.gp_gain)} GP`;

/** The header's right side: "5 ideas · up to +$179.45 gross profit", or why there's nothing to show. */
export function upsellsMeta(status:UpsellsStatus,chips:readonly RepUpsell[],editable:boolean){
  if(!editable)return 'Offered while the quote can be edited';
  if(status==='loading')return 'Looking for ideas…';
  if(status==='error'&&!chips.length)return 'Suggestions aren’t available right now';
  return formatUpsellSummary(chips);
}
