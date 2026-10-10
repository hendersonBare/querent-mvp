'use client';
import {useEffect,useState,type FormEvent,type ReactNode} from 'react';
import {TriangleAlert} from 'lucide-react';
import {FUEL_TYPES,type FreightCostSettings,type FreightRateSettings,type FuelStatus,type FuelType} from '@/domain';
import {checkFreightUpdate} from '@/server/freight/controls';
import {formatUsd} from '@/server/freight/engine';
import {formatRateBp} from '@/server/freight/recovery';
import type {FreightSettingsView,ImpactPreviewView} from '@/server/rep/freight-settings';
import {repPageStyles as page} from '../RepPage';
import {loadFreight,loadFreightPreview,saveFreight} from './api';
import {Switch} from './Switch';
import s from './Settings.module.css';

// Free delivery pricing on Settings > Pricing & delivery (v3 spec §4.3, §4.4, §4.6, §4.7, §6;
// decisions 28–31, 35, 36; task C3), manager only: a rep never gets these cards and their routes
// answer 403. Three cards, loaded from GET /api/rep/settings/freight (which also refreshes the fuel
// price, at most once a day):
//   - Free delivery pricing: the one toggle, locked until the impact preview has been viewed (in the
//     last 24 hours, OA-11); "View impact preview" with the quotes affected and the average line
//     price change per category; the ramp-in schedule with today's step.
//   - Recovery pool: the pool rate against the starting rate with the eligible count, the cap, the
//     rate in force and its ramp step, the trailing 90 days' modelled cost and recovered amount, and
//     the starting rate, caps and ramp settings.
//   - Delivery cost model: the fuel price in use with its source, age and warnings (stale, missing,
//     zero), and the cost inputs in dollars (stored as cents).
// No what-if simulator and no settings history (decision log, "Explicitly NOT in scope").

const cents=(dollars:number)=>Number((dollars*100).toPrecision(12));
const bp=(percent:number)=>Number((percent*100).toPrecision(12));
const parse=(text:string)=>text.trim()===''?Number.NaN:Number(text);
const money=(c:number)=>formatUsd(c/100);
const pct2=(b:number)=>`+${(b/100).toFixed(2)}%`;
const day=(iso:string)=>new Date(iso).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
const failed=(e:unknown,fallback:string)=>e instanceof Error?e.message:fallback;

export function FreeDeliveryControls(){
  const [view,setView]=useState<FreightSettingsView|null>(null),[error,setError]=useState('');
  useEffect(()=>{
    let cancelled=false;
    loadFreight().then(v=>{if(!cancelled)setView(v);},e=>{if(!cancelled)setError(failed(e,'Free delivery pricing couldn’t be loaded.'));});
    return ()=>{cancelled=true;};
  },[]);
  if(!view)return <section className={`${page.card} ${s.card} ${s.freight}`} aria-label="Free delivery pricing settings">
    {error?<p className={s.error} role="alert">{error}</p>:<p className={s.loading} role="status">Loading free delivery pricing…</p>}
  </section>;
  return <div className={s.freight}>
    <FreeDeliveryCard view={view} onView={setView}/>
    <div className={s.split}>
      <PoolCard view={view} onView={setView}/>
      <CostModelCard view={view} onView={setView}/>
    </div>
  </div>;
}

/** A card: a section named by its heading, with the one-line intro under it. */
function Card({id,title,intro,children}:{id:string;title:string;intro:string;children:ReactNode}){
  return <section className={`${page.card} ${s.card}`} aria-labelledby={id}>
    <div className={s.head}><h2 id={id}>{title}</h2><p>{intro}</p></div>
    {children}
  </section>;
}

function FreeDeliveryCard({view,onView}:{view:FreightSettingsView;onView:(v:FreightSettingsView)=>void}){
  const [preview,setPreview]=useState<ImpactPreviewView|null>(null);
  const [busy,setBusy]=useState<'preview'|'toggle'|null>(null),[error,setError]=useState('');
  const locked=!view.enabled&&!view.previewValid;
  const {pool}=view;

  async function viewPreview(){
    setBusy('preview');setError('');
    try{setPreview(await loadFreightPreview());onView(await loadFreight());}
    catch(e){setError(failed(e,'The impact preview couldn’t be loaded. Try again.'));}
    finally{setBusy(null);}
  }
  async function toggle(){
    setBusy('toggle');setError('');
    try{onView(await saveFreight({enabled:!view.enabled}));}
    catch(e){setError(failed(e,'That change wasn’t saved. Try again.'));}
    finally{setBusy(null);}
  }

  return <Card id="settings-free-delivery" title="Free delivery pricing"
    intro="Delivery quotes show Freight $0.00, and the modelled delivery cost is recovered in item prices at the pool rate, ramped in. Contract lines and quotes under the free-delivery threshold carry none.">
    {error&&<p className={s.error} role="alert">{error}</p>}
    <ul className={s.rows}>
      <li className={s.row}>
        <div className={s.rowText}>
          <span className={s.name}>Free delivery pricing</span>
          <span className={s.sub} id="free-delivery-note">{locked?'View the impact preview before turning it on.'
            :view.enabled?'Turning it off reprices draft quotes on their next open. Sent quotes keep their prices.'
            :'Preview viewed. You can turn it on for the next 24 hours. Draft quotes reprice on their next open.'}</span>
        </div>
        <span className={s.state} id="free-delivery-state" data-state={view.enabled?'on':'default'}>{view.enabled&&view.enabledAt?`On since ${day(view.enabledAt)}`:'Off'}</span>
        <Switch checked={view.enabled} label="Free delivery pricing" describedBy="free-delivery-note" disabled={busy!==null||locked} onToggle={()=>void toggle()}/>
      </li>
    </ul>

    <div className={s.panel}>
      <h3 className={s.minor}>Ramp-in</h3>
      <p className={s.panelText}>The rate steps up over {view.rates.rampDays} days in {pool.steps} {pool.steps===1?'step':'steps'}, to {formatRateBp(pool.baseBp)} at the last step.</p>
      <table className={s.table} aria-label="Ramp-in schedule">
        <thead><tr><th scope="col">Step</th><th scope="col">Starts</th><th scope="col" className={s.num}>Rate</th></tr></thead>
        <tbody>
          {pool.schedule.map(step=><tr key={step.step} aria-current={step.step===pool.step?'step':undefined}>
            <th scope="row">Step {step.step} of {pool.steps}{step.step===pool.step&&<span className={s.tag}>Now</span>}</th>
            <td>From day {step.fromDay}{step.startsAt&&<span className={s.sub}>{day(step.startsAt)}</span>}</td>
            <td className={s.num}>{formatRateBp(step.rateBp)}</td>
          </tr>)}
        </tbody>
      </table>
    </div>

    <div className={s.panel}>
      <h3 className={s.minor}>Impact preview</h3>
      {preview?<>
        <p className={s.panelText}>{preview.affected} of {preview.deliveryQuotes} delivery quotes from the last {preview.windowDays} days would carry freight recovery.</p>
        {preview.categories.length?<table className={s.table}>
          <caption className={s.srOnly}>Average line price change by category</caption>
          <thead><tr><th scope="col">Category</th><th scope="col" className={s.num}>Lines</th>
            <th scope="col" className={s.num}>At step 1 ({formatRateBp(preview.step1Bp)})</th><th scope="col" className={s.num}>At full rate ({formatRateBp(preview.fullBp)})</th></tr></thead>
          <tbody>
            {preview.categories.map(c=><tr key={c.categoryId}>
              <th scope="row">{c.categoryName}</th><td className={s.num}>{c.lines}</td><td className={s.num}>{pct2(c.step1ChangeBp)}</td><td className={s.num}>{pct2(c.fullChangeBp)}</td>
            </tr>)}
          </tbody>
        </table>:<p className={s.panelText}>No line prices would change.</p>}
      </>:<p className={s.panelText}>How many recent delivery quotes would carry recovery, and the average line price change by product category at the first step and at the full rate.</p>}
      <div className={s.rateActions}>
        <button type="button" className={s.save} disabled={busy!==null} onClick={()=>void viewPreview()}>
          {busy==='preview'?'Loading…':preview?'View impact preview again':'View impact preview'}
        </button>
      </div>
    </div>
  </Card>;
}

/** A number field in a facts row: label, the input, and its unit. */
function NumberField({id,label,value,unit,prefix,step,disabled,onChange}:{id:string;label:string;value:string;unit?:string;prefix?:string;step:number;disabled:boolean;onChange:(value:string)=>void}){
  return <div>
    <dt><label htmlFor={id}>{label}</label></dt>
    <dd><span className={s.rate}>
      {prefix&&<span aria-hidden="true">{prefix}</span>}
      <input id={id} type="number" inputMode="decimal" min={0} step={step} value={value} disabled={disabled} onChange={event=>onChange(event.target.value)}/>
      {unit&&<span>{unit}</span>}
    </span></dd>
  </div>;
}

/** A form's text state that follows the stored value when it changes, and saving, error and Saved. */
function useForm<T extends Record<string,string>>(fromView:()=>T,stored:unknown){
  const [text,setText]=useState(fromView);
  const [seen,setSeen]=useState(stored);
  if(stored!==seen){setSeen(stored);setText(fromView());}
  const [saving,setSaving]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
  const set=(key:keyof T)=>(value:string)=>{setText(current=>({...current,[key]:value}));setSaved(false);setError('');};
  return {text,setText,set,saving,setSaving,error,setError,saved,setSaved};
}

const rateText=(r:FreightRateSettings)=>({startingRateBp:String(r.startingRateBp/100),rateCapBp:String(r.rateCapBp/100),lineCapBp:String(r.lineCapBp/100),rampSteps:String(r.rampSteps),rampDays:String(r.rampDays)});

function PoolCard({view,onView}:{view:FreightSettingsView;onView:(v:FreightSettingsView)=>void}){
  const {pool}=view;
  const form=useForm(()=>rateText(view.rates),view.rates);
  const {text}=form;
  const typed:FreightRateSettings={startingRateBp:bp(parse(text.startingRateBp)),rateCapBp:bp(parse(text.rateCapBp)),lineCapBp:bp(parse(text.lineCapBp)),rampSteps:parse(text.rampSteps),rampDays:parse(text.rampDays)};
  const {problem}=checkFreightUpdate({rates:typed});
  const changed=!problem&&(Object.keys(typed) as (keyof FreightRateSettings)[]).some(k=>typed[k]!==view.rates[k]);
  const edited=JSON.stringify(text)!==JSON.stringify(rateText(view.rates));

  async function save(event:FormEvent){
    event.preventDefault();
    if(!changed||form.saving)return;
    form.setSaving(true);form.setError('');
    try{onView(await saveFreight({rates:typed}));form.setSaved(true);}
    catch(e){form.setError(failed(e,'The pool settings weren’t saved. Try again.'));}
    finally{form.setSaving(false);}
  }

  const base=pool.usingPool?pool.computedBp!:pool.startingBp;
  const basis=pool.usingPool?`Pool rate ${formatRateBp(pool.computedBp!)} from ${pool.count} eligible quotes (starting rate ${formatRateBp(pool.startingBp)})`
    :`Starting rate ${formatRateBp(pool.startingBp)}: ${pool.count} of ${pool.minCount} eligible quotes, not enough to compute the pool yet`;
  return <Card id="settings-pool" title="Recovery pool"
    intro={`The rate is the last ${pool.windowDays} days’ modelled delivery cost over the goods value of accepted delivery quotes that carried recovery, once ${pool.minCount} are in the window. Until then the starting rate applies.`}>
    <dl className={s.facts}>
      <div><dt>Recovery rate</dt><dd>{basis}{base>pool.baseBp&&`, capped at ${formatRateBp(pool.capBp)}`}</dd></div>
      <div><dt>Rate cap</dt><dd>{formatRateBp(pool.capBp)}</dd></div>
      <div><dt>Rate in force</dt><dd>{view.enabled&&pool.step>0?`${formatRateBp(pool.rateInForceBp)}, ramp step ${pool.step} of ${pool.steps}`:'Off'}</dd></div>
      <div><dt>Modelled delivery cost, last {pool.windowDays} days</dt><dd>{money(pool.modelledCents)}</dd></div>
      <div><dt>Recovered in prices, last {pool.windowDays} days</dt><dd>{money(pool.recoveredCents)}</dd></div>
    </dl>
    <form className={s.panel} onSubmit={event=>void save(event)} noValidate>
      <h3 className={s.minor}>Rates and ramp</h3>
      {(form.error||problem)&&<p className={s.error} role="alert">{form.error||problem}</p>}
      <dl className={s.facts}>
        <NumberField id="pool-starting" label="Starting rate" value={text.startingRateBp} unit="% of goods" step={0.01} disabled={form.saving} onChange={form.set('startingRateBp')}/>
        <NumberField id="pool-cap" label="Rate cap" value={text.rateCapBp} unit="% at most" step={0.01} disabled={form.saving} onChange={form.set('rateCapBp')}/>
        <NumberField id="pool-line-cap" label="Per-line cap" value={text.lineCapBp} unit="% over a line’s price" step={0.01} disabled={form.saving} onChange={form.set('lineCapBp')}/>
        <NumberField id="pool-steps" label="Ramp steps" value={text.rampSteps} unit="steps" step={1} disabled={form.saving} onChange={form.set('rampSteps')}/>
        <NumberField id="pool-days" label="Ramp days" value={text.rampDays} unit="days" step={1} disabled={form.saving} onChange={form.set('rampDays')}/>
      </dl>
      <div className={s.rateActions}>
        <button type="submit" className={s.save} disabled={!changed||form.saving}>{form.saving?'Saving…':'Save pool settings'}</button>
        {edited&&<button type="button" className={s.save} disabled={form.saving} onClick={()=>{form.setText(rateText(view.rates));form.setError('');form.setSaved(false);}}>Cancel</button>}
        <span className={s.floorNote} role="status" data-tone="ok">{form.saved&&!edited?'Saved':''}</span>
      </div>
    </form>
    <p className={s.foot}>A quote freezes the rate in force when it is created. Sent quotes keep their prices.</p>
  </Card>;
}

const costText=(c:FreightCostSettings)=>({mpg:String(c.mpg),fuelType:c.fuelType as string,wearCentsPerMile:String(c.wearCentsPerMile/100),depreciationCentsPerMile:String(c.depreciationCentsPerMile/100),
  driverCentsPerHour:String(c.driverCentsPerHour/100),avgSpeedMph:String(c.avgSpeedMph),stopMinutes:String(c.stopMinutes),fuelManualCents:c.fuelManualCents===null?'':String(c.fuelManualCents/100)});

const SOURCE:Record<FuelStatus['source'],string>={manual:'manual price',api:'OilPriceAPI',seed:'seeded price',none:'no price'};
const age=(days:number)=>days===0?'today':days===1?'1 day old':`${days} days old`;
/** "$3.40/gal, seeded price, 17 days old" */
const fuelLine=(f:FuelStatus)=>[`${money(f.cents)}/gal`,SOURCE[f.source],...(f.ageDays===null?[]:[age(f.ageDays)])].join(', ');

function CostModelCard({view,onView}:{view:FreightSettingsView;onView:(v:FreightSettingsView)=>void}){
  const form=useForm(()=>costText(view.cost),view.cost);
  const {text}=form;
  const typed:FreightCostSettings={mpg:parse(text.mpg),fuelType:text.fuelType as FuelType,wearCentsPerMile:cents(parse(text.wearCentsPerMile)),depreciationCentsPerMile:cents(parse(text.depreciationCentsPerMile)),
    driverCentsPerHour:cents(parse(text.driverCentsPerHour)),avgSpeedMph:parse(text.avgSpeedMph),stopMinutes:parse(text.stopMinutes),fuelManualCents:text.fuelManualCents.trim()===''?null:cents(parse(text.fuelManualCents))};
  const {problem}=checkFreightUpdate({cost:typed});
  const changed=!problem&&(Object.keys(typed) as (keyof FreightCostSettings)[]).some(k=>typed[k]!==view.cost[k]);
  const edited=JSON.stringify(text)!==JSON.stringify(costText(view.cost));

  async function save(event:FormEvent){
    event.preventDefault();
    if(!changed||form.saving)return;
    form.setSaving(true);form.setError('');
    try{onView(await saveFreight({cost:typed}));form.setSaved(true);}
    catch(e){form.setError(failed(e,'The cost model wasn’t saved. Try again.'));}
    finally{form.setSaving(false);}
  }

  return <Card id="settings-cost-model" title="Delivery cost model"
    intro="Each delivery’s cost is modelled from the round trip: fuel, wear, depreciation and the driver’s time, plus any stop time. Road miles come from the delivery rates’ road factor.">
    <dl className={s.facts}>
      {view.fuel.map(f=><div key={f.state}><dt>{f.state} {f.fuelType}</dt><dd>{fuelLine(f)}</dd></div>)}
    </dl>
    {view.warnings.length>0&&<ul className={s.warnings} aria-label="Fuel price warnings">
      {view.warnings.map(w=><li key={w}><TriangleAlert aria-hidden="true" size={14} strokeWidth={2.2}/>{w}</li>)}
    </ul>}
    <form className={s.panel} onSubmit={event=>void save(event)} noValidate>
      <h3 className={s.minor}>Inputs</h3>
      {(form.error||problem)&&<p className={s.error} role="alert">{form.error||problem}</p>}
      <dl className={s.facts}>
        <NumberField id="cost-mpg" label="Vehicle MPG" value={text.mpg} unit="miles per gallon" step={0.1} disabled={form.saving} onChange={form.set('mpg')}/>
        <div>
          <dt><label htmlFor="cost-fuel-type">Fuel type</label></dt>
          <dd><select id="cost-fuel-type" className={s.select} value={text.fuelType} disabled={form.saving} onChange={event=>form.set('fuelType')(event.target.value)}>
            {FUEL_TYPES.map(f=><option key={f} value={f}>{f==='gasoline'?'Gasoline (state price, daily)':'Diesel (manual price)'}</option>)}
          </select></dd>
        </div>
        <NumberField id="cost-fuel-manual" label="Manual fuel price" value={text.fuelManualCents} prefix="$" unit="per gallon; blank uses the state price" step={0.01} disabled={form.saving} onChange={form.set('fuelManualCents')}/>
        <NumberField id="cost-wear" label="Wear per mile" value={text.wearCentsPerMile} prefix="$" unit="per mile" step={0.01} disabled={form.saving} onChange={form.set('wearCentsPerMile')}/>
        <NumberField id="cost-depreciation" label="Depreciation per mile" value={text.depreciationCentsPerMile} prefix="$" unit="per mile" step={0.01} disabled={form.saving} onChange={form.set('depreciationCentsPerMile')}/>
        <NumberField id="cost-driver" label="Driver pay per hour" value={text.driverCentsPerHour} prefix="$" unit="per hour" step={0.01} disabled={form.saving} onChange={form.set('driverCentsPerHour')}/>
        <NumberField id="cost-speed" label="Average speed" value={text.avgSpeedMph} unit="mph" step={1} disabled={form.saving} onChange={form.set('avgSpeedMph')}/>
        <NumberField id="cost-stop" label="Stop time" value={text.stopMinutes} unit="minutes per delivery" step={1} disabled={form.saving} onChange={form.set('stopMinutes')}/>
      </dl>
      <div className={s.rateActions}>
        <button type="submit" className={s.save} disabled={!changed||form.saving}>{form.saving?'Saving…':'Save cost model'}</button>
        {edited&&<button type="button" className={s.save} disabled={form.saving} onClick={()=>{form.setText(costText(view.cost));form.setError('');form.setSaved(false);}}>Cancel</button>}
        <span className={s.floorNote} role="status" data-tone="ok">{form.saved&&!edited?'Saved':''}</span>
      </div>
    </form>
    <p className={s.foot}>A quote keeps the modelled cost measured when it was created, or when its branch or ship-to changed.</p>
  </Card>;
}
