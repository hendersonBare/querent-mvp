import type {Fulfillment,PriceBasis} from '@/domain';
import {roundCents,toCents} from '@/lib/money';

// Free delivery pricing's recovery within a quote (spec §4.5, decisions 32–34). Pure and
// client-safe: no server-only imports, no I/O; src/server/freight/quote.ts gathers the inputs and
// stores the result. All money is integer cents; rates are integer bp.
//
//   eligible line  = price_basis != 'contract' AND unit_price not null AND qty > 0
//   goods_cents    = Σ eligible unit_price_cents × qty                         (OA-16)
//   target_cents   = roundCents(rate_bp × goods_cents ÷ 10000)
//   margin_i       = (unit_price_cents − unit_cost_cents) × qty                (eligible lines with margin_i > 0 only)
//   share_i        = floor(target × margin_i ÷ Σ margin)
//   remainder      = target − Σ share_i → the highest-margin line (ties: lowest line_no, OA-24)
//   per_unit_i     = roundCents(share_i ÷ qty_i)                               (OA-6)
//   cap_i          = floor(unit_price_cents × line_cap_bp ÷ 10000)
//   freight_recovery_i = min(per_unit_i, cap_i)                                (excess dropped, OA-5)
//
// Every eligible line at zero or negative margin: no recovery at all. The customer pays
// unit_price + freight_recovery (customerUnitPrice in quotes/snapshot.ts, which has no cost in
// reach); unit_price stays the engine or rep price. This module reads unit cost: internal only.

export interface RecoveryLine {
  line_no:number;qty:number;
  /** The line's unit price before recovery (OA-25), in cents; null while unpriced. */
  unitPriceCents:number|null;
  unitCostCents:number;
  basis:PriceBasis|null;
}

export interface RecoveryInput {
  /** The quote's frozen rate, in bp. */
  rateBp:number;
  /** The per-line cap over the unit price, in bp (default 800). */
  lineCapBp:number;
  lines:readonly RecoveryLine[];
}

/** One line's recovery: integer cents per unit. */
export interface LineRecovery {line_no:number;freight_recovery:number}

const eligible=(l:RecoveryLine):l is RecoveryLine&{unitPriceCents:number}=>l.basis!=='contract'&&l.unitPriceCents!==null&&l.qty>0;

function checkBp(label:string,value:number){
  if(!Number.isInteger(value)||value<0)throw new RangeError(`${label} must be a whole number of bp, at least 0 (got ${value}).`);
}

/** The goods value recovery is computed on: the non-contract priced lines (OA-16), in cents. */
export function recoveryGoodsCents(lines:readonly RecoveryLine[]){
  return lines.filter(eligible).reduce((sum,l)=>sum+l.unitPriceCents*l.qty,0);
}

/** Each line's freight recovery in cents per unit, in the order given (0 for lines that get none). Throws a RangeError on a rate or cap it can't use. */
export function allocateRecovery({rateBp,lineCapBp,lines}:RecoveryInput):LineRecovery[]{
  checkBp('The recovery rate',rateBp);checkBp('The line cap',lineCapBp);
  const result=new Map<RecoveryLine,number>(lines.map(l=>[l,0]));
  const target=roundCents(rateBp*recoveryGoodsCents(lines)/10_000);
  const earning=lines.filter(eligible).map(l=>({line:l,margin:(l.unitPriceCents-l.unitCostCents)*l.qty})).filter(m=>m.margin>0);
  const totalMargin=earning.reduce((sum,m)=>sum+m.margin,0);
  if(target>0&&totalMargin>0){
    const shares=earning.map(m=>({...m,share:Math.floor(target*m.margin/totalMargin)}));
    const top=shares.reduce((best,m)=>m.margin>best.margin||(m.margin===best.margin&&m.line.line_no<best.line.line_no)?m:best);
    top.share+=target-shares.reduce((sum,m)=>sum+m.share,0);
    for(const {line,share} of shares){
      const cap=Math.floor(line.unitPriceCents*lineCapBp/10_000);
      result.set(line,Math.min(roundCents(share/line.qty),cap));
    }
  }
  return lines.map(l=>({line_no:l.line_no,freight_recovery:result.get(l)!}));
}

export interface CarriesRecoveryInput {
  /** Free delivery pricing is on. */
  enabled:boolean;
  fulfillment:Fulfillment;
  /** The rep set freight by hand. */
  overridden:boolean;
  /** The items subtotal before recovery, in dollars, as the free-delivery threshold compares it. */
  subtotal:number;
  freeThreshold:number;
  /** The engine's freight is call for freight (beyond the radius, no ship-to, no distance). */
  callForFreight:boolean;
}

/**
 * Whether a quote carries recovery (spec §4.5): free delivery pricing is on, it is a delivery, the
 * rep didn't override freight, its goods reach the free-delivery threshold (OA-3) and the engine
 * can price its freight (not call for freight, OA-7).
 */
export function carriesRecovery({enabled,fulfillment,overridden,subtotal,freeThreshold,callForFreight}:CarriesRecoveryInput){
  return enabled&&fulfillment==='delivery'&&!overridden&&!callForFreight&&toCents(subtotal)>=toCents(freeThreshold);
}

/** "5.0%": a rate in bp as the rep reads it (spec §4.6). */
export const formatRateBp=(bp:number)=>`${(bp/100).toFixed(1)}%`;
