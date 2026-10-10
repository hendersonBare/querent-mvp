'use client';
import {useState,type FormEvent} from 'react';
import type {DeliveryRates,PricingSettings} from '@/domain';
import {formatUsd,priceDelivery} from '@/server/freight/engine';
import {DELIVERY_RATE_KEYS,DELIVERY_RATE_LIMITS,checkDeliveryRates,type DeliveryRateKey} from '@/server/freight/rates';
import {BROKEN_CASE_UPLIFT_PERCENT} from '@/server/pricing/engine';
import {repPageStyles as page} from '../RepPage';
import {saveSetting} from './api';
import {FreeDeliveryControls} from './FreeDeliveryPricing';
import {Switch} from './Switch';
import s from './Settings.module.css';

// Settings > Pricing & delivery. Pricing: the scarcity uplift (spec §5.1), off by default, and the
// broken-case rule, fixed at customer price + 10%; the pricing engine reads them each time it
// prices a quote. Delivery rates (spec §5.3): every rate the freight engine uses, editable by any
// rep, with a worked example that follows the values being typed. Drafts use saved rates from
// their next change on; a sent quote keeps the freight it went out with.
// The manager also gets free delivery pricing's cards below them (./FreeDeliveryPricing, task C3);
// the two cards above stay as they are (OA-55).

/** The worked example's distance, as in spec §5.3: 12 mi straight-line is 15.0 road miles. */
const EXAMPLE_MILES=15;

const asText=(rates:DeliveryRates)=>Object.fromEntries(DELIVERY_RATE_KEYS.map(key=>[key,String(rates[key])])) as Record<DeliveryRateKey,string>;
const asNumbers=(text:Record<DeliveryRateKey,string>)=>Object.fromEntries(DELIVERY_RATE_KEYS.map(key=>[key,text[key].trim()===''?Number.NaN:Number(text[key])]));

export function PricingDelivery({pricing,delivery,manager=false,onPricing,onDelivery}:{pricing:PricingSettings;delivery:DeliveryRates;manager?:boolean;onPricing:(pricing:PricingSettings)=>void;onDelivery:(delivery:DeliveryRates)=>void}){
  const [saving,setSaving]=useState(false),[error,setError]=useState('');
  const on=pricing.scarcity_uplift_enabled;

  async function toggle(){
    setSaving(true);setError('');
    try{onPricing(await saveSetting<PricingSettings>('pricing',{scarcity_uplift_enabled:!on}));}
    catch(e){setError(e instanceof Error?e.message:'That change wasn’t saved. Try again.');}
    finally{setSaving(false);}
  }

  return <>
  <div className={s.split}>
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
        <li className={s.row}>
          <div className={s.rowText}>
            <span className={s.name}>Broken case</span>
            <span className={s.sub}>When a line’s quantity is less than a full case, suggest the customer price + {BROKEN_CASE_UPLIFT_PERCENT}%, never above list. A higher last-paid price still wins.</span>
          </div>
          <span className={s.state}>Always on</span>
        </li>
      </ul>
      <p className={s.foot}>Applies to quotes Querent prices from now on. Drafts already priced keep their suggestions.</p>
    </section>

    <DeliveryRatesForm delivery={delivery} onSaved={onDelivery}/>
  </div>
  {manager&&<FreeDeliveryControls/>}
  </>;
}

/** Delivery rates: all six, saved together. */
function DeliveryRatesForm({delivery,onSaved}:{delivery:DeliveryRates;onSaved:(delivery:DeliveryRates)=>void}){
  const [text,setText]=useState(()=>asText(delivery));
  const [seen,setSeen]=useState(delivery);
  if(delivery!==seen){setSeen(delivery);setText(asText(delivery));}
  const [saving,setSaving]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);

  const {rates,problem}=checkDeliveryRates(asNumbers(text));
  const changed=rates!==null&&DELIVERY_RATE_KEYS.some(key=>rates[key]!==delivery[key]);
  const edited=DELIVERY_RATE_KEYS.some(key=>text[key]!==String(delivery[key]));
  const shown=rates??delivery;
  const example=priceDelivery({origin:'SLC',miles:EXAMPLE_MILES,subtotal:0,rates:shown});
  const miles=(n:number)=>`${n.toLocaleString('en-US')} road miles`;

  async function save(event:FormEvent){
    event.preventDefault();
    if(!rates||!changed||saving)return;
    setSaving(true);setError('');setSaved(false);
    try{onSaved(await saveSetting<DeliveryRates>('delivery',rates));setSaved(true);}
    catch(e){setError(e instanceof Error?e.message:'The delivery rates weren’t saved. Try again.');}
    finally{setSaving(false);}
  }
  const cancel=()=>{setText(asText(delivery));setError('');setSaved(false);};

  return <section className={`${page.card} ${s.card}`} aria-labelledby="settings-delivery">
    <div className={s.head}>
      <h2 id="settings-delivery">Delivery rates</h2>
      <p>Freight is priced by road distance from the quote’s branch. Change any rate and save: draft quotes use the new rates from their next change on.</p>
    </div>
    <form onSubmit={event=>void save(event)} noValidate>
      {(error||problem)&&<p className={s.error} role="alert">{error||problem}</p>}
      <dl className={s.facts}>
        {DELIVERY_RATE_KEYS.map(key=>{
          const {label,min,max,decimals,unit}=DELIVERY_RATE_LIMITS[key];
          const id=`delivery-${key}`;
          return <div key={key}>
            <dt><label htmlFor={id}>{label}</label></dt>
            <dd>
              <span className={s.rate}>
                {unit==='$'&&<span aria-hidden="true">$</span>}
                <input id={id} type="number" inputMode="decimal" min={min} max={max} step={1/10**decimals} value={text[key]} disabled={saving}
                  onChange={event=>{setText(current=>({...current,[key]:event.target.value}));setSaved(false);setError('');}}/>
                {unit==='mi'&&<span>miles; farther is call for freight</span>}
                {unit==='x'&&<span>× straight-line miles</span>}
              </span>
            </dd>
          </div>;
        })}
      </dl>
      <div className={s.rateActions}>
        <button type="submit" className={s.save} disabled={!changed||saving}>{saving?'Saving…':'Save rates'}</button>
        {edited&&<button type="button" className={s.save} disabled={saving} onClick={cancel}>Cancel</button>}
        <span className={s.floorNote} role="status" data-tone="ok">{saved&&!edited?'Saved':''}</span>
      </div>
    </form>
    <p className={s.foot}>
      Minimum {formatUsd(shown.min_charge)}; free with an items total of {formatUsd(shown.free_threshold)} or more; within {miles(shown.max_radius_miles)}.
      {example.formula&&<> Example, {EXAMPLE_MILES.toFixed(1)} road miles from SLC: <span className={s.formula}>{example.formula}</span></>}
      {' '}Sent quotes keep the freight they went out with.
    </p>
  </section>;
}
