'use client';
import {useState} from 'react';
import type {PricingSettings} from '@/domain';
import {formatUsd,priceDelivery} from '@/server/freight/engine';
import type {RepSettings} from '@/server/rep/settings';
import {repPageStyles as page} from '../RepPage';
import {saveSetting} from './api';
import {Switch} from './Switch';
import s from './Settings.module.css';

// Settings > Pricing & delivery. Pricing: the scarcity uplift (spec §5.1), off by default; the
// pricing engine reads it each time it prices a quote. Delivery rates (spec §5.3) come from
// Herrick's freight table and are shown read-only, with a worked example from the freight engine.

/** The worked example's distance, as in spec §5.3: 12 mi straight-line is 15.0 road miles. */
const EXAMPLE_MILES=15;

export function PricingDelivery({pricing,delivery,onPricing}:{pricing:PricingSettings;delivery:RepSettings['delivery'];onPricing:(pricing:PricingSettings)=>void}){
  const [saving,setSaving]=useState(false),[error,setError]=useState('');
  const on=pricing.scarcity_uplift_enabled;

  async function toggle(){
    setSaving(true);setError('');
    try{onPricing(await saveSetting<PricingSettings>('pricing',{scarcity_uplift_enabled:!on}));}
    catch(e){setError(e instanceof Error?e.message:'That change wasn’t saved. Try again.');}
    finally{setSaving(false);}
  }

  const example=priceDelivery({origin:'SLC',miles:EXAMPLE_MILES,subtotal:0,rates:delivery});
  const miles=(n:number)=>`${n.toLocaleString('en-US')} road miles`;
  return <div className={s.split}>
    <section className={`${page.card} ${s.card}`} aria-labelledby="settings-pricing">
      <div className={s.head}>
        <h2 id="settings-pricing">Pricing</h2>
        <p>How Querent suggests a price for each quote line.</p>
      </div>
      {error&&<p className={s.error} role="alert">{error}</p>}
      <ul className={s.rows}>
        <li className={s.row}>
          <div className={s.rowText}>
            <span className={s.name}>Scarcity uplift</span>
            <span className={s.sub}>When the quote’s branch is the only one that can fill a line, or has less than 1.5× the quantity on hand, suggest the customer price + 5%, never above list.</span>
          </div>
          <span className={s.state} id="scarcity-state" data-state={on?'on':'default'}>{on?'On':'Off (default)'}</span>
          <Switch checked={on} label="Scarcity uplift" describedBy="scarcity-state" disabled={saving} onToggle={()=>void toggle()}/>
        </li>
      </ul>
      <p className={s.foot}>Applies to quotes Querent prices from now on. Drafts already priced keep their suggestions.</p>
    </section>

    <section className={`${page.card} ${s.card}`} aria-labelledby="settings-delivery">
      <div className={s.head}>
        <h2 id="settings-delivery">Delivery rates</h2>
        <p>Freight is priced by road distance from the quote’s branch. These rates come from Herrick’s freight table and can’t be changed here.</p>
      </div>
      <dl className={s.facts}>
        <div><dt>Base fee</dt><dd>{formatUsd(delivery.base_fee)}</dd></div>
        <div><dt>Per road mile</dt><dd>{formatUsd(delivery.per_mile)}</dd></div>
        <div><dt>Minimum charge</dt><dd>{formatUsd(delivery.min_charge)}</dd></div>
        <div><dt>Free delivery</dt><dd>Items total {formatUsd(delivery.free_threshold)} or more</dd></div>
        <div><dt>Delivery radius</dt><dd>{miles(delivery.max_radius_miles)}; farther is call for freight</dd></div>
        <div><dt>Road miles</dt><dd>Straight-line miles × {delivery.road_factor}</dd></div>
      </dl>
      {example.formula&&<p className={s.foot}>Example, {EXAMPLE_MILES.toFixed(1)} road miles from SLC: <span className={s.formula}>{example.formula}</span></p>}
    </section>
  </div>;
}
