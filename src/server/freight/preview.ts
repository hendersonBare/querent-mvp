import type {PriceBasis} from '@/domain';
import {roundCents} from '@/lib/money';
import {allocateRecovery} from './recovery';

// The impact preview (v3 spec §4.7, decision 35): before free delivery pricing can be turned on, the
// manager sees how many recent delivery quotes would carry recovery and, per product category, the
// average line price change at the ramp's first step and at the full rate. Pure: no server-only
// imports, no I/O; src/server/rep/freight-settings.ts gathers the quotes (repository previewQuotes)
// and decides which would carry recovery (freight/quote.ts wouldCarryRecovery).
//
//   per line       = allocateRecovery at the rate (margin-weighted, per-line cap; contract lines get 0)
//   line change    = freight_recovery ÷ unit_price                     (bp of the line's unit price)
//   category avg   = mean line change over the category's priced lines (qty > 0, unit price > 0) in
//                    the affected quotes, contract and zero-margin lines included at 0 (an open assumption, C3)
//
// Averages round to whole bp (0.01%) with roundCents. Internal only: it reads unit cost.

export interface PreviewLine {
  categoryId:string;categoryName:string;
  /** The category's sort order, the order the table lists categories in. */
  categoryOrder:number;
  line_no:number;qty:number;unitPriceCents:number|null;unitCostCents:number;basis:PriceBasis|null;
}
/** A delivery quote of the window; `carries`: it would carry recovery with free delivery pricing on. */
export interface PreviewQuote {carries:boolean;lines:readonly PreviewLine[]}

export interface CategoryImpact {categoryId:string;categoryName:string;
  /** Priced lines averaged. */
  lines:number;
  /** Average line price change in bp of the unit price, at the step-1 rate and at the full rate. */
  step1ChangeBp:number;fullChangeBp:number}

export interface ImpactPreview {
  /** Delivery quotes in the window, and how many of them would carry recovery. */
  deliveryQuotes:number;affected:number;
  /** The rates the change is computed at: the ramp's first step and the full rate (step n). */
  step1Bp:number;fullBp:number;
  categories:CategoryImpact[];
}

/** Each line's recovery at `rateBp` as bp of its unit price (null for a line that isn't priced). */
function lineChanges(lines:readonly PreviewLine[],rateBp:number,lineCapBp:number){
  const allocated=allocateRecovery({rateBp,lineCapBp,lines:lines.map(l=>({line_no:l.line_no,qty:l.qty,unitPriceCents:l.unitPriceCents,unitCostCents:l.unitCostCents,basis:l.basis}))});
  return lines.map((l,i)=>l.unitPriceCents!==null&&l.unitPriceCents>0&&l.qty>0?allocated[i].freight_recovery*10_000/l.unitPriceCents:null);
}

/** The preview over `quotes` at the step-1 and full rates (whole bp), with the per-line cap in force. */
export function impactPreview({quotes,step1Bp,fullBp,lineCapBp}:{quotes:readonly PreviewQuote[];step1Bp:number;fullBp:number;lineCapBp:number}):ImpactPreview{
  const affected=quotes.filter(q=>q.carries);
  const byCategory=new Map<string,{name:string;order:number;step1:number[];full:number[]}>();
  for(const q of affected){
    const step1=lineChanges(q.lines,step1Bp,lineCapBp),full=lineChanges(q.lines,fullBp,lineCapBp);
    q.lines.forEach((l,i)=>{
      if(step1[i]===null||full[i]===null)return;
      const entry=byCategory.get(l.categoryId)??{name:l.categoryName,order:l.categoryOrder,step1:[],full:[]};
      entry.step1.push(step1[i]!);entry.full.push(full[i]!);
      byCategory.set(l.categoryId,entry);
    });
  }
  const mean=(values:number[])=>roundCents(values.reduce((sum,v)=>sum+v,0)/values.length);
  const categories=[...byCategory.entries()].sort(([a,x],[b,y])=>x.order-y.order||a.localeCompare(b))
    .map(([categoryId,c])=>({categoryId,categoryName:c.name,lines:c.full.length,step1ChangeBp:mean(c.step1),fullChangeBp:mean(c.full)}));
  return {deliveryQuotes:quotes.length,affected:affected.length,step1Bp,fullBp,categories};
}
