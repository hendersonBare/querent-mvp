'use client';
import {useState,type ReactNode} from 'react';
import {Toggle} from '@/components/ui';
import type {DeliveryRates,PricingSettings} from '@/domain';
import type {FeatureFlags} from '@/server/flags';
import {formatUsd,priceDelivery} from '@/server/freight/engine';
import {DELIVERY_RATE_KEYS,DELIVERY_RATE_LIMITS,checkDeliveryRates,type DeliveryRateKey} from '@/server/freight/rates';
import {BROKEN_CASE_UPLIFT_PERCENT,SCARCITY_STOCK_MULTIPLE,SCARCITY_UPLIFT_PERCENT} from '@/server/pricing/engine';
import {saveSetting} from './api';
import {FreightSections} from './FreeDeliveryPricing';
import {plainFormula} from './format';
import {Card,NumberField,Problem,SaveButton,SettingRow,SettingsFrame} from './parts';
import s from './Settings.module.css';

// Settings > Pricing and delivery (spec §5.1, §5.3; plan U8; C_S4), the manager's. Pricing: the scarcity
// uplift (off by default) and the broken-case rule, fixed at customer price + 10%; the pricing engine reads
// them each time it prices a quote. Delivery rates: every rate the freight engine uses, right-aligned, the
// unit under the label where a new user could misread it (Appendix E), with a worked example that follows
// the typing. Drafts use saved rates from their next change on; a sent quote keeps its freight.
// Below them, only while each one's flag is on (decision 48): Free delivery pricing, the Recovery pool and
// the Delivery cost model (./FreeDeliveryPricing, C_S5 to C_S7). No frame: the "Saved" line beside Save.

/** The worked example's distance, as in spec §5.3: 12 mi straight-line is 15.0 road miles. */
const EXAMPLE_MILES=15;
/** The unit line under a rate's label (C_S4); the dollar rates carry "$" before the field instead. */
const UNIT_LINE:Partial<Record<DeliveryRateKey,string>>={max_radius_miles:'Miles. Farther is call for freight',road_factor:'Multiplier on straight-line miles'};

const asText=(rates:DeliveryRates)=>Object.fromEntries(DELIVERY_RATE_KEYS.map(key=>[key,String(rates[key])])) as Record<DeliveryRateKey,string>;
const asNumbers=(text:Record<DeliveryRateKey,string>)=>Object.fromEntries(DELIVERY_RATE_KEYS.map(key=>[key,text[key].trim()===''?Number.NaN:Number(text[key])]));

export function PricingDelivery({pricing,delivery,flags,tabs}:{pricing:PricingSettings;delivery:DeliveryRates;flags:FeatureFlags;tabs:ReactNode}){
  return <SettingsFrame tabs={tabs}>
    <div className={s.split}>
      <div className={s.left}><PricingCard initial={pricing}/></div>
      <div className={s.right}><DeliveryRatesCard initial={delivery}/></div>
    </div>
    <FreightSections flags={flags}/>
  </SettingsFrame>;
}

function PricingCard({initial}:{initial:PricingSettings}){
  const [pricing,setPricing]=useState(initial);
  const [saving,setSaving]=useState(false),[error,setError]=useState('');
  const on=pricing.scarcity_uplift_enabled;
  async function toggle(){
    setSaving(true);setError('');
    try{setPricing(await saveSetting<PricingSettings>('pricing',{scarcity_uplift_enabled:!on}));}
    catch(e){setError(e instanceof Error?e.message:'That change wasn’t saved. Try again.');}
    finally{setSaving(false);}
  }
  return <Card title="Pricing" note="How Querent suggests a price for each quote line.">
    <Problem>{error}</Problem>
    <SettingRow label="Scarcity uplift" sub={`When one branch can fill a line, or has under ${SCARCITY_STOCK_MULTIPLE}x the quantity on hand, suggest the customer price + ${SCARCITY_UPLIFT_PERCENT}%, never above list.`}>
      <div className={s.control}>
        <span className={s.state} id="scarcity-state">{on?'On':'Off (default)'}</span>
        <Toggle checked={on} label="Scarcity uplift" describedBy="scarcity-state" disabled={saving} onChange={()=>void toggle()}/>
      </div>
    </SettingRow>
    <SettingRow label="Broken case" sub={`When a line's quantity is under a full case, suggest the customer price + ${BROKEN_CASE_UPLIFT_PERCENT}%, never above list. A higher last-paid price still wins.`}>
      <span className={s.state}>Always on</span>
    </SettingRow>
    <div className={s.foot}>Applies to quotes Querent prices from now on. Drafts already priced keep their suggestions.</div>
  </Card>;
}

/** Delivery rates: all six, saved together. */
function DeliveryRatesCard({initial}:{initial:DeliveryRates}){
  const [stored,setStored]=useState(initial);
  const [text,setText]=useState(()=>asText(initial));
  const [saving,setSaving]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
  const {rates,problem}=checkDeliveryRates(asNumbers(text));
  const changed=rates!==null&&DELIVERY_RATE_KEYS.some(key=>rates[key]!==stored[key]);
  const shown=rates??stored;
  const example=priceDelivery({origin:'SLC',miles:EXAMPLE_MILES,subtotal:0,rates:shown});

  async function save(){
    if(!rates||saving)return;
    if(!changed){setSaved(false);return;}
    setSaving(true);setError('');setSaved(false);
    try{const next=await saveSetting<DeliveryRates>('delivery',rates);setStored(next);setText(asText(next));setSaved(true);}
    catch(e){setError(e instanceof Error?e.message:'The delivery rates weren’t saved. Try again.');}
    finally{setSaving(false);}
  }

  return <Card title="Delivery rates" note="Draft quotes use new rates from their next change." saved={saved}
    action={<SaveButton label="Save rates" disabled={!rates||saving} onClick={()=>void save()}/>}>
    <Problem>{error||problem}</Problem>
    {DELIVERY_RATE_KEYS.map(key=>{
      const {label,unit}=DELIVERY_RATE_LIMITS[key];
      const id=`delivery-${key}`;
      return <SettingRow key={key} label={label} sub={UNIT_LINE[key]} htmlFor={id}>
        <NumberField id={id} width={100} prefix={unit==='$'?'$':undefined} value={text[key]} disabled={saving}
          onChange={e=>{const value=e.target.value;setText(t=>({...t,[key]:value}));setSaved(false);setError('');}}/>
      </SettingRow>;
    })}
    <div className={`${s.foot} ${s.footTall}`}>
      {`Minimum ${formatUsd(shown.min_charge)}. Free with an items total of ${formatUsd(shown.free_threshold)} or more, within ${shown.max_radius_miles.toLocaleString('en-US')} road miles.`}
      {example.formula&&<>{` Example, ${EXAMPLE_MILES.toFixed(1)} miles from SLC: `}<span className={s.mono}>{plainFormula(example.formula)}</span>.</>}
      {' Sent quotes keep the freight they went out with.'}
    </div>
  </Card>;
}
