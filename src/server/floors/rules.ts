import type {RepFloor} from '@/domain';

// Margin floors (spec §5.2). margin = (unit price - unit cost) / unit price, and a line is below
// floor when its margin is under floor[quote rep][line category]. Below floor only ever warns
// (the red line above the price field, the count in Confirm send): nothing here blocks approval
// or sending. Pure, with no server imports, so the rep portal can recompute the warning in the
// browser as the rep types a price. The database adapter is ./service.

/** Every rep x category pair is seeded at 20%. A pair with no floor row uses it too. */
export const DEFAULT_FLOOR=0.2;

/**
 * Margins and floors are compared in tenths of a percentage point, the precision the rep portal
 * shows ("26.6%"). So a line shown at 20.0% is never flagged against a 20% floor, even when its
 * unrounded margin is 19.97% or float noise makes it 0.19999999999999987.
 */
const STEPS=1000;
/** `fraction` in tenths of a percent, rounded half up. toPrecision drops float noise (199.49999999999997 -> 199.5). */
const tenths=(fraction:number)=>Math.round(Number((fraction*STEPS).toPrecision(12)))+0;

/**
 * (price - cost) / price as a fraction (0.266 = 26.6%). Negative when cost is above price. null
 * when there is no usable price (missing, $0 or less) or cost, since the margin is undefined.
 */
export function margin(price:number|null|undefined,cost:number|null|undefined):number|null{
  if(price==null||cost==null||!Number.isFinite(price)||!Number.isFinite(cost)||price<=0)return null;
  return (price-cost)/price;
}

/** A margin rounded to the portal's precision: 0.26582 -> 0.266. */
export const roundMargin=(fraction:number)=>tenths(fraction)/STEPS;
/** A margin as the portal shows it: "26.6%", or "—" with no margin. Use this so the number shown matches the warning. */
export const formatMargin=(fraction:number|null)=>fraction===null?'—':`${(tenths(fraction)/10).toFixed(1)}%`;
/** A floor as the warning prints it: "20%", "18.5%". */
export const formatFloor=(floor:number)=>`${tenths(floor)/10}%`;

/** True when `fraction` is under `floor` at the portal's precision. Exactly at the floor is not below. */
export const isBelowFloor=(fraction:number,floor:number)=>tenths(fraction)<tenths(floor);

/** One stored floor. `floors` lists may hold several reps' rows; resolution picks the quote rep's. */
export type FloorRow=Pick<RepFloor,'rep_id'|'category_id'|'margin_floor'>;
/** `source` is 'default' when the rep has no usable floor row for the category. */
export interface ResolvedFloor {floor:number;source:'rep'|'default'}

/** The same range the database allows: at least 0 and below 1. */
const usable=(floor:number)=>Number.isFinite(floor)&&floor>=0&&floor<1;

/** floor[rep][category]. Falls back to DEFAULT_FLOOR when the pair has no row, or its value is unusable. */
export function resolveFloor(floors:readonly FloorRow[],repId:string,categoryId:string):ResolvedFloor{
  const row=floors.find(f=>f.rep_id===repId&&f.category_id===categoryId);
  return row&&usable(row.margin_floor)?{floor:row.margin_floor,source:'rep'}:{floor:DEFAULT_FLOOR,source:'default'};
}

/** The red warning above the price field (spec §4): "Below Brandi's 20% Fasteners floor". Uses the rep's first name. */
export function floorLabel(repName:string,floor:number,categoryName:string){
  const first=repName.trim().split(/\s+/)[0];
  return `Below ${first?`${first}'s`:'the rep\'s'} ${formatFloor(floor)} ${categoryName} floor`;
}

/** What floor status needs from a quote line (QuoteLine has all of it). */
export interface FloorLine {unit_price:number|null;unit_cost:number;category_id:string;category_name:string}
/** The quote's rep (always the customer's assigned rep, spec §5.2) and the floors to resolve against. */
export interface FloorContext {repId:string;repName:string;floors:readonly FloorRow[]}

export interface LineFloorStatus {
  /** Fraction; null when the line has no price yet, or a price of $0 or less. */
  margin:number|null;
  /** The floor that applies, as a fraction (0.3) and in percent (30). */
  floor:number;floorPct:number;floorSource:ResolvedFloor['source'];
  belowFloor:boolean;
  /** The red warning, or null when the line is not below its floor. */
  label:string|null;
}

/**
 * Whether one line is below floor[quote rep][line category], and the warning to show. A line with
 * no price yet has nothing to warn about (Send is blocked for it separately); a price of $0 or
 * less earns nothing and is always below floor.
 */
export function lineFloorStatus(line:FloorLine,{repId,repName,floors}:FloorContext):LineFloorStatus{
  const {floor,source}=resolveFloor(floors,repId,line.category_id);
  const fraction=margin(line.unit_price,line.unit_cost);
  const belowFloor=fraction===null?line.unit_price!==null&&line.unit_price<=0:isBelowFloor(fraction,floor);
  return {margin:fraction,floor,floorPct:tenths(floor)/10,floorSource:source,belowFloor,label:belowFloor?floorLabel(repName,floor,line.category_name):null};
}

/** What the summary needs from a quote (Quote has all of it). */
export interface FloorQuote {rep_id:string;rep_name:string;lines:readonly (FloorLine&{id:string})[]}
export interface QuoteFloorSummary {rep_id:string;rep_name:string;lines:(LineFloorStatus&{line_id:string})[];belowFloorCount:number}

/** Every line's floor status, in line order, against the quote rep's floors, plus how many lines are below floor. */
export function quoteFloorSummary(quote:FloorQuote,floors:readonly FloorRow[]):QuoteFloorSummary{
  const context={repId:quote.rep_id,repName:quote.rep_name,floors};
  const lines=quote.lines.map(line=>({line_id:line.id,...lineFloorStatus(line,context)}));
  return {rep_id:quote.rep_id,rep_name:quote.rep_name,lines,belowFloorCount:lines.filter(l=>l.belowFloor).length};
}

/** Each rep edits only their own floors (spec §5.2). Anyone who is not a rep (no rep id) edits none. */
export const canEditFloor=(actingRepId:string|null|undefined,floorRepId:string)=>!!actingRepId&&actingRepId===floorRepId;
