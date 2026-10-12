'use client';
import {useEffect,useRef,useState} from 'react';
import {Select,Toggle} from '@/components/ui';
import {FUEL_TYPES,type FreightCostSettings,type FreightRateSettings,type FuelStatus,type FuelType} from '@/domain';
import type {FeatureFlags} from '@/server/flags';
import {checkFreightUpdate} from '@/server/freight/controls';
import {formatUsd} from '@/server/freight/engine';
import {formatRateBp} from '@/server/freight/recovery';
import type {FreightSettingsView,ImpactPreviewView} from '@/server/rep/freight-settings';
import {loadFreight,loadFreightPreview,saveFreight} from './api';
import {plusDollars} from './format';
import {Card,GridHead,NumberField,Problem,SaveButton,SettingRow} from './parts';
import s from './Settings.module.css';

// The feature-flagged sections of Settings > Pricing and delivery (v3 spec §4.3, §4.4, §4.6, §4.7, §6;
// decisions 28 to 31, 35, 36, 48; tasks C3, U8; C_S5, C_S6, C_S7), the manager's. Each renders only while its
// flag is on (FEATURE_FREE_DELIVERY_PRICING, FEATURE_RECOVERY_POOL, FEATURE_DELIVERY_COST_MODEL); with all three
// off nothing loads. They read GET /api/rep/settings/freight (which also refreshes the fuel price, at most
// once a day) and save through PUT, which refuses a part whose flag is off:
//   - Free delivery pricing: the one toggle, locked until the impact preview has been viewed (in the last 24
//     hours, OA-11); the ramp-in with today's step; "View impact preview" opens the preview (C_S7): per
//     category, the delivery quotes it touches and the average line price change in dollars at the first step
//     and at the full rate.
//   - Recovery pool: the pool rate against the starting rate with the eligible count, the cap, the rate in
//     force and its ramp step, the trailing 90 days' modelled cost and recovered amount, and the starting
//     rate, caps and ramp.
//   - Delivery cost model: the fuel price in use with its source and age, and the cost inputs in dollars
//     (stored as cents).
// The design's "FEATURE FLAG: HIDDEN" badges and dashed outlines are markers and never render. No frame (the
// frames draw the toggle on): the locked and unlocked lines under the toggle and "Off"; the pool before 20
// eligible quotes; the fuel warnings as plain red lines (decision 52); "Saved" beside Save; the preview's
// "No line prices would change." No what-if simulator and no settings history ("Explicitly NOT in scope").

const cents=(dollars:number)=>Number((dollars*100).toPrecision(12));
const bp=(percent:number)=>Number((percent*100).toPrecision(12));
const parse=(text:string)=>text.trim()===''?Number.NaN:Number(text);
const money=(c:number)=>formatUsd(c/100);
const day=(iso:string)=>new Date(iso).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
const failed=(e:unknown,fallback:string)=>e instanceof Error?e.message:fallback;

export function FreightSections({flags}:{flags:FeatureFlags}){
  const any=flags.freeDeliveryPricing||flags.recoveryPool||flags.deliveryCostModel;
  const [view,setView]=useState<FreightSettingsView|null>(null),[error,setError]=useState('');
  useEffect(()=>{
    if(!any)return;
    let cancelled=false;
    loadFreight().then(v=>{if(!cancelled)setView(v);},e=>{if(!cancelled)setError(failed(e,'Free delivery pricing couldn’t be loaded.'));});
    return ()=>{cancelled=true;};
  },[any]);
  if(!any)return null;
  if(!view)return error?<p className={s.problem} role="alert">{error}</p>:null;
  return <>
    {flags.freeDeliveryPricing&&<FreeDeliveryCard view={view} onView={setView}/>}
    {(flags.recoveryPool||flags.deliveryCostModel)&&<div className={s.split}>
      {flags.recoveryPool&&<div className={s.left}><PoolCard view={view} onView={setView}/></div>}
      {flags.deliveryCostModel&&<div className={s.right}><CostModelCard view={view} onView={setView}/></div>}
    </div>}
  </>;
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

  return <Card title="Free delivery pricing"
    note="Delivery quotes show Freight $0.00. The delivery cost is recovered in item prices at the pool rate, ramped in. Contract lines and quotes under the free-delivery threshold carry none.">
    <Problem>{error}</Problem>
    <SettingRow label="Free delivery pricing" sub={locked?'View the impact preview before turning it on.'
      :view.enabled?'Turning it off reprices draft quotes on their next open. Sent quotes keep their prices.'
      :'Preview viewed. You can turn it on for the next 24 hours. Draft quotes reprice on their next open.'}>
      <div className={s.control}>
        <span className={s.state} id="free-delivery-state">{view.enabled&&view.enabledAt?`On since ${day(view.enabledAt)}`:'Off'}</span>
        <Toggle checked={view.enabled} label="Free delivery pricing" describedBy="free-delivery-state" disabled={busy!==null||locked} onChange={()=>void toggle()}/>
      </div>
    </SettingRow>
    <div className={s.ramp}>
      <div className={s.strong}>Ramp-in</div>
      <div className={s.rampText}>{`The rate steps up over ${view.rates.rampDays} days in ${pool.steps} ${pool.steps===1?'step':'steps'}, to ${formatRateBp(pool.baseBp)} at the last step.`}</div>
    </div>
    <div role="table" aria-label="Ramp-in schedule">
      <GridHead className={s.rampGrid} labels={['Step','Starts','Rate']} right={[2]}/>
      {pool.schedule.map(step=>{
        const now=step.step===pool.step;
        return <div key={step.step} role="row" aria-current={now?'step':undefined} className={`${s.gridRow} ${s.rampGrid} ${now?s.rampNow:s.rampRow}`}>
          <div role="rowheader" className={s.stepName}>{`Step ${step.step} of ${pool.steps}`}{now&&<> <span className={s.now}>NOW</span></>}</div>
          <div role="cell"><div className={s.rampDay}>{`From day ${step.fromDay}`}</div>{step.startsAt&&<div className={s.rampDate}>{day(step.startsAt)}</div>}</div>
          <div role="cell" className={s.rampRate}>{formatRateBp(step.rateBp)}</div>
        </div>;
      })}
    </div>
    <div className={s.preview}>
      <div>
        <div className={s.strong}>Impact preview</div>
        <div className={s.previewText}>How many recent delivery quotes would carry recovery, and the average line price change by category at the first step and at the full rate.</div>
      </div>
      <button type="button" className={s.green} disabled={busy!==null} onClick={()=>void viewPreview()}>View impact preview</button>
    </div>
    {preview&&<ImpactPreviewDialog preview={preview} onClose={()=>setPreview(null)}/>}
  </Card>;
}

/** C_S7: the preview over the page, with Close. */
function ImpactPreviewDialog({preview,onClose}:{preview:ImpactPreviewView;onClose:()=>void}){
  const dialog=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const opener=document.activeElement as HTMLElement|null;
    dialog.current?.focus();
    return ()=>opener?.focus?.();
  },[]);
  return <>
    <div className={s.backdrop} onClick={onClose}/>
    <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="impact-preview-title" tabIndex={-1} className={s.dialog}
      onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();onClose();}}}>
      <h2 id="impact-preview-title" className={s.dialogTitle}>Impact preview</h2>
      <div className={s.dialogText}>{`Based on the last ${preview.deliveryQuotes} delivery ${preview.deliveryQuotes===1?'quote':'quotes'}.`}</div>
      {preview.categories.length?<>
        <div role="table" aria-label="Average change per line price">
          <GridHead className={`${s.impactGrid} ${s.impactHead}`} labels={['Category','Quotes affected',`Step 1 (${formatRateBp(preview.step1Bp)})`,`Full rate (${formatRateBp(preview.fullBp)})`]} right={[1,2,3]}/>
          {preview.categories.map(c=><div key={c.categoryId} role="row" className={`${s.impactRow} ${s.impactGrid}`}>
            <div role="rowheader" className={s.impactName}>{c.categoryName}</div>
            <div role="cell" className={s.alignRight}>{`${c.quotes} of ${preview.deliveryQuotes}`}</div>
            <div role="cell" className={s.alignRight}>{plusDollars(c.step1ChangeCents)}</div>
            <div role="cell" className={s.impactFull}>{plusDollars(c.fullChangeCents)}</div>
          </div>)}
        </div>
        <div className={s.dialogNote}>Average change per line price.</div>
      </>:<div className={s.dialogText}>No line prices would change.</div>}
      <div className={s.dialogActions}><button type="button" className={s.close} onClick={onClose}>Close</button></div>
    </div>
  </>;
}

/** A form's text state that follows the stored value when it changes, and saving, error and Saved. */
function useForm<T extends Record<string,string>>(fromView:()=>T,stored:unknown){
  const [text,setText]=useState(fromView);
  const [seen,setSeen]=useState(stored);
  if(stored!==seen){setSeen(stored);setText(fromView());}
  const [saving,setSaving]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
  const set=(key:keyof T)=>(value:string)=>{setText(current=>({...current,[key]:value}));setSaved(false);setError('');};
  return {text,set,saving,setSaving,error,setError,saved,setSaved};
}

/** A number row: the label, the unit line under it, the 90px field (C_S6). */
function Field({id,label,sub,prefix,value,disabled,onChange}:{id:string;label:string;sub?:string;prefix?:string;value:string;disabled:boolean;onChange:(value:string)=>void}){
  return <SettingRow label={label} sub={sub} htmlFor={id}>
    <NumberField id={id} width={90} prefix={prefix} value={value} disabled={disabled} onChange={e=>onChange(e.target.value)}/>
  </SettingRow>;
}

const Fact=({name,children}:{name:string;children:string})=><div className={s.fact}><span className={s.factName}>{name}</span><span className={s.factValue}>{children}</span></div>;

const rateText=(r:FreightRateSettings)=>({startingRateBp:String(r.startingRateBp/100),rateCapBp:String(r.rateCapBp/100),lineCapBp:String(r.lineCapBp/100),rampSteps:String(r.rampSteps),rampDays:String(r.rampDays)});

function PoolCard({view,onView}:{view:FreightSettingsView;onView:(v:FreightSettingsView)=>void}){
  const {pool}=view;
  const form=useForm(()=>rateText(view.rates),view.rates);
  const {text}=form;
  const typed:FreightRateSettings={startingRateBp:bp(parse(text.startingRateBp)),rateCapBp:bp(parse(text.rateCapBp)),lineCapBp:bp(parse(text.lineCapBp)),rampSteps:parse(text.rampSteps),rampDays:parse(text.rampDays)};
  const {problem}=checkFreightUpdate({rates:typed});
  const changed=!problem&&(Object.keys(typed) as (keyof FreightRateSettings)[]).some(k=>typed[k]!==view.rates[k]);

  async function save(){
    if(problem||form.saving||!changed)return;
    form.setSaving(true);form.setError('');
    try{onView(await saveFreight({rates:typed}));form.setSaved(true);}
    catch(e){form.setError(failed(e,'The pool settings weren’t saved. Try again.'));}
    finally{form.setSaving(false);}
  }

  const base=pool.usingPool?pool.computedBp!:pool.startingBp;
  const basis=pool.usingPool?`Pool rate ${formatRateBp(pool.computedBp!)} from ${pool.count} eligible quotes (starting rate ${formatRateBp(pool.startingBp)})`
    :`Starting rate ${formatRateBp(pool.startingBp)}: ${pool.count} of ${pool.minCount} eligible quotes, not enough to compute the pool yet`;
  return <Card title="Recovery pool" saved={form.saved}
    note={`Last ${pool.windowDays} days of modelled delivery cost over the goods value of accepted delivery quotes. The starting rate applies until ${pool.minCount} are in.`}
    action={<SaveButton label="Save pool settings" disabled={!!problem||form.saving} onClick={()=>void save()}/>}>
    <Problem>{form.error||problem}</Problem>
    <Fact name="Recovery rate">{`${basis}${base>pool.baseBp?`, capped at ${formatRateBp(pool.capBp)}`:''}`}</Fact>
    <Fact name="Rate cap">{formatRateBp(pool.capBp)}</Fact>
    <Fact name="Rate in force">{view.enabled&&pool.step>0?`${formatRateBp(pool.rateInForceBp)}, ramp step ${pool.step} of ${pool.steps}`:'Off'}</Fact>
    <Fact name={`Modelled delivery cost, last ${pool.windowDays} days`}>{money(pool.modelledCents)}</Fact>
    <Fact name={`Recovered in prices, last ${pool.windowDays} days`}>{money(pool.recoveredCents)}</Fact>
    <h3 className={s.minor}>Rates and ramp</h3>
    <Field id="pool-starting" label="Starting rate" sub="Percent of goods value" value={text.startingRateBp} disabled={form.saving} onChange={form.set('startingRateBp')}/>
    <Field id="pool-cap" label="Rate cap" sub="Percent, at most" value={text.rateCapBp} disabled={form.saving} onChange={form.set('rateCapBp')}/>
    <Field id="pool-line-cap" label="Per-line cap" sub="Percent over a line's price, at most" value={text.lineCapBp} disabled={form.saving} onChange={form.set('lineCapBp')}/>
    <Field id="pool-steps" label="Ramp steps" sub="Number of steps" value={text.rampSteps} disabled={form.saving} onChange={form.set('rampSteps')}/>
    <Field id="pool-days" label="Ramp days" sub="Days" value={text.rampDays} disabled={form.saving} onChange={form.set('rampDays')}/>
    <div className={s.foot}>A quote freezes the rate in force when it is created. Sent quotes keep their prices.</div>
  </Card>;
}

const costText=(c:FreightCostSettings)=>({mpg:String(c.mpg),fuelType:c.fuelType as string,wearCentsPerMile:String(c.wearCentsPerMile/100),depreciationCentsPerMile:String(c.depreciationCentsPerMile/100),
  driverCentsPerHour:String(c.driverCentsPerHour/100),avgSpeedMph:String(c.avgSpeedMph),stopMinutes:String(c.stopMinutes),fuelManualCents:c.fuelManualCents===null?'':String(c.fuelManualCents/100)});

const SOURCE:Record<FuelStatus['source'],string>={manual:'manual price',api:'OilPriceAPI',seed:'seeded price',none:'no price'};
const age=(days:number)=>days===0?'today':days===1?'1 day old':`${days} days old`;
/** "$3.40/gal, seeded price, 17 days old" */
const fuelLine=(f:FuelStatus)=>[`${money(f.cents)}/gal`,SOURCE[f.source],...(f.ageDays===null?[]:[age(f.ageDays)])].join(', ');
const FUEL_OPTIONS=FUEL_TYPES.map(f=>({value:f as FuelType,label:f==='gasoline'?'Gasoline (state price)':'Diesel (manual price)'}));

function CostModelCard({view,onView}:{view:FreightSettingsView;onView:(v:FreightSettingsView)=>void}){
  const form=useForm(()=>costText(view.cost),view.cost);
  const {text}=form;
  const typed:FreightCostSettings={mpg:parse(text.mpg),fuelType:text.fuelType as FuelType,wearCentsPerMile:cents(parse(text.wearCentsPerMile)),depreciationCentsPerMile:cents(parse(text.depreciationCentsPerMile)),
    driverCentsPerHour:cents(parse(text.driverCentsPerHour)),avgSpeedMph:parse(text.avgSpeedMph),stopMinutes:parse(text.stopMinutes),fuelManualCents:text.fuelManualCents.trim()===''?null:cents(parse(text.fuelManualCents))};
  const {problem}=checkFreightUpdate({cost:typed});
  const changed=!problem&&(Object.keys(typed) as (keyof FreightCostSettings)[]).some(k=>typed[k]!==view.cost[k]);

  async function save(){
    if(problem||form.saving||!changed)return;
    form.setSaving(true);form.setError('');
    try{onView(await saveFreight({cost:typed}));form.setSaved(true);}
    catch(e){form.setError(failed(e,'The cost model wasn’t saved. Try again.'));}
    finally{form.setSaving(false);}
  }

  return <Card title="Delivery cost model" saved={form.saved} note="Fuel, wear, depreciation and the driver's time for the round trip, plus any stop time."
    action={<SaveButton label="Save cost model" disabled={!!problem||form.saving} onClick={()=>void save()}/>}>
    <Problem>{form.error||problem}</Problem>
    {view.fuel.map(f=><Fact key={f.state} name={`${f.state} ${f.fuelType}`}>{fuelLine(f)}</Fact>)}
    {view.warnings.map(w=><p key={w} className={s.warning}>{w}</p>)}
    <h3 className={s.minor}>Inputs</h3>
    <Field id="cost-mpg" label="Vehicle MPG" sub="Miles per gallon" value={text.mpg} disabled={form.saving} onChange={form.set('mpg')}/>
    <SettingRow label="Fuel type">
      <Select<FuelType> label="Fuel type" value={text.fuelType as FuelType} options={FUEL_OPTIONS} filled className={s.fuelBox} onChange={form.set('fuelType')}/>
    </SettingRow>
    <Field id="cost-fuel-manual" label="Manual fuel price" sub="Per gallon. Blank uses the state price" prefix="$" value={text.fuelManualCents} disabled={form.saving} onChange={form.set('fuelManualCents')}/>
    <Field id="cost-wear" label="Wear per mile" prefix="$" value={text.wearCentsPerMile} disabled={form.saving} onChange={form.set('wearCentsPerMile')}/>
    <Field id="cost-depreciation" label="Depreciation per mile" prefix="$" value={text.depreciationCentsPerMile} disabled={form.saving} onChange={form.set('depreciationCentsPerMile')}/>
    <Field id="cost-driver" label="Driver pay per hour" prefix="$" value={text.driverCentsPerHour} disabled={form.saving} onChange={form.set('driverCentsPerHour')}/>
    <Field id="cost-speed" label="Average speed" sub="Miles per hour" value={text.avgSpeedMph} disabled={form.saving} onChange={form.set('avgSpeedMph')}/>
    <Field id="cost-stop" label="Stop time" sub="Minutes per delivery" value={text.stopMinutes} disabled={form.saving} onChange={form.set('stopMinutes')}/>
    <div className={s.foot}>A quote keeps the modelled cost measured when it was created, or when its branch or ship-to changed.</div>
  </Card>;
}
