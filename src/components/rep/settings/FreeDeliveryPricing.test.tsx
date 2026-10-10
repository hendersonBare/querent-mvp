import {fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {FreightSettingsView,ImpactPreviewView} from '@/server/rep/freight-settings';

// The manager's free delivery pricing cards on Settings > Pricing & delivery (v3 spec §4.3, §4.6,
// §4.7, §6; decisions 28–31, 35, 36): the toggle (locked until the impact preview has been viewed),
// the preview, the ramp schedule, the pool panel, the cost model inputs and the fuel price status.

const {FreeDeliveryControls}=await import('./FreeDeliveryPricing');

const VIEW:FreightSettingsView={
  enabled:false,enabledAt:null,previewViewedAt:null,previewValid:false,
  cost:{mpg:10,fuelType:'gasoline',wearCentsPerMile:20,depreciationCentsPerMile:15,driverCentsPerHour:2500,avgSpeedMph:35,stopMinutes:0,fuelManualCents:null},
  rates:{startingRateBp:300,rateCapBp:800,lineCapBp:800,rampSteps:3,rampDays:90},
  pool:{computedBp:null,count:4,minCount:20,usingPool:false,startingBp:300,capBp:800,baseBp:300,step:0,steps:3,rateInForceBp:0,windowDays:90,
    schedule:[{step:1,fromDay:0,rateBp:100,startsAt:null},{step:2,fromDay:30,rateBp:200,startsAt:null},{step:3,fromDay:60,rateBp:300,startsAt:null}],
    modelledCents:16852,recoveredCents:0},
  fuel:[{state:'UT',fuelType:'gasoline',cents:340,source:'seed',asOf:'2026-09-23T00:00:00.000Z',ageDays:17,warnings:['Fuel price is 17 days old.']}],
  warnings:['Fuel price is 17 days old.'],
};
const PREVIEW:ImpactPreviewView={deliveryQuotes:5,affected:2,step1Bp:100,fullBp:300,steps:3,windowDays:90,viewedAt:'2026-10-10T18:00:00.000Z',
  categories:[{categoryId:'fasteners',categoryName:'Fasteners',lines:3,step1ChangeBp:102,fullChangeBp:302},{categoryId:'tools',categoryName:'Tools',lines:1,step1ChangeBp:55,fullChangeBp:166}]};
const ENABLED:FreightSettingsView={...VIEW,enabled:true,enabledAt:'2026-10-10T18:01:00.000Z',previewViewedAt:PREVIEW.viewedAt,previewValid:true,
  pool:{...VIEW.pool,step:1,rateInForceBp:100,schedule:VIEW.pool.schedule.map((s,i)=>({...s,startsAt:new Date(Date.parse('2026-10-10T18:01:00.000Z')+s.fromDay*86_400_000).toISOString(),step:i+1}))}};

type Reply={status?:number;body:unknown};
let replies:Reply[]=[];
const fetchMock=vi.fn(async(_input:RequestInfo|URL,_init?:RequestInit)=>{
  const next=replies.shift()??{body:{detail:'Not found.'},status:404};
  return Response.json(next.body,{status:next.status??200});
});
const calls=()=>fetchMock.mock.calls.map(([url,init])=>({url:String(url),method:init?.method??'GET',body:init?.body?JSON.parse(String(init.body)):undefined}));

beforeEach(()=>{replies=[];fetchMock.mockClear();vi.stubGlobal('fetch',fetchMock);});
afterEach(()=>vi.unstubAllGlobals());

async function renderLoaded(view=VIEW){
  replies=[{body:view}];
  render(<FreeDeliveryControls/>);
  await screen.findByRole('heading',{name:'Free delivery pricing'});
}
const toggle=()=>screen.getByRole('switch',{name:'Free delivery pricing'});
const card=(name:string)=>screen.getByRole('region',{name});

describe('Free delivery pricing',()=>{
  it('loads from GET /api/rep/settings/freight and keeps the toggle locked until the impact preview is viewed',async()=>{
    await renderLoaded();
    expect(calls()[0]).toMatchObject({url:'/api/rep/settings/freight',method:'GET'});
    expect(toggle()).toBeDisabled();
    expect(toggle()).toHaveAttribute('aria-checked','false');
    expect(card('Free delivery pricing')).toHaveTextContent('View the impact preview before turning it on.');
    // The ramp schedule: 3 steps over 90 days at a third, two thirds and all of the rate.
    const ramp=within(card('Free delivery pricing')).getByRole('table',{name:'Ramp-in schedule'});
    expect(within(ramp).getAllByRole('row').slice(1).map(r=>r.textContent)).toEqual(['Step 1 of 3From day 01.0%','Step 2 of 3From day 302.0%','Step 3 of 3From day 603.0%']);
  });

  it('shows the preview (quotes affected and the change per category), then unlocks the toggle and enables with ramp step 1',async()=>{
    await renderLoaded();
    replies=[{body:PREVIEW},{body:{...VIEW,previewViewedAt:PREVIEW.viewedAt,previewValid:true}}];
    fireEvent.click(screen.getByRole('button',{name:'View impact preview'}));
    const table=await screen.findByRole('table',{name:'Average line price change by category'});
    expect(card('Free delivery pricing')).toHaveTextContent('2 of 5 delivery quotes from the last 90 days would carry freight recovery.');
    expect(within(table).getAllByRole('row').map(r=>r.textContent)).toEqual([
      'CategoryLinesAt step 1 (1.0%)At full rate (3.0%)','Fasteners3+1.02%+3.02%','Tools1+0.55%+1.66%',
    ]);
    expect(calls().map(c=>`${c.method} ${c.url}`)).toEqual(['GET /api/rep/settings/freight','GET /api/rep/settings/freight/preview','GET /api/rep/settings/freight']);
    await waitFor(()=>expect(toggle()).toBeEnabled());
    replies=[{body:ENABLED}];
    fireEvent.click(toggle());
    await waitFor(()=>expect(toggle()).toHaveAttribute('aria-checked','true'));
    expect(calls().at(-1)).toEqual({url:'/api/rep/settings/freight',method:'PUT',body:{enabled:true}});
    expect(card('Recovery pool')).toHaveTextContent('Ramp step 1 of 3');
    expect(within(card('Free delivery pricing')).getAllByRole('row')[1]).toHaveTextContent('Now');
  });

  it('says why when the server refuses to enable (409 preview_required)',async()=>{
    await renderLoaded({...VIEW,previewValid:true,previewViewedAt:'2026-10-10T00:00:00.000Z'});
    replies=[{status:409,body:{detail:'View the impact preview before turning on free delivery pricing.',code:'preview_required'}}];
    fireEvent.click(toggle());
    expect(await screen.findByRole('alert')).toHaveTextContent('View the impact preview before turning on free delivery pricing.');
    expect(toggle()).toHaveAttribute('aria-checked','false');
  });

  it('turns it off without a preview',async()=>{
    await renderLoaded({...ENABLED,previewValid:false});
    expect(toggle()).toBeEnabled();
    replies=[{body:{...ENABLED,enabled:false,previewValid:false,pool:{...ENABLED.pool,step:0,rateInForceBp:0}}}];
    fireEvent.click(toggle());
    await waitFor(()=>expect(toggle()).toHaveAttribute('aria-checked','false'));
    expect(calls().at(-1)).toEqual({url:'/api/rep/settings/freight',method:'PUT',body:{enabled:false}});
  });
});

describe('Recovery pool',()=>{
  it('shows the starting rate against the pool, the eligible count, the cap, the ramp step and the 90-day cost and recovery',async()=>{
    await renderLoaded();
    const pool=card('Recovery pool');
    expect(pool).toHaveTextContent('Starting rate 3.0%: 4 of 20 eligible quotes, not enough to compute the pool yet');
    expect(pool).toHaveTextContent('Rate cap8.0%');
    expect(pool).toHaveTextContent('Rate in forceOff');
    expect(pool).toHaveTextContent('Modelled delivery cost, last 90 days$168.52');
    expect(pool).toHaveTextContent('Recovered in prices, last 90 days$0.00');
  });

  it('shows the computed pool rate once 20 quotes are in the window',async()=>{
    await renderLoaded({...ENABLED,pool:{...ENABLED.pool,computedBp:400,count:24,usingPool:true,baseBp:400,step:2,rateInForceBp:267}});
    expect(card('Recovery pool')).toHaveTextContent('Pool rate 4.0% from 24 eligible quotes (starting rate 3.0%)');
    expect(card('Recovery pool')).toHaveTextContent('Rate in force2.7%, ramp step 2 of 3');
  });

  it('saves the starting rate, caps and ramp in percent and days',async()=>{
    await renderLoaded();
    const pool=card('Recovery pool');
    fireEvent.change(within(pool).getByRole('spinbutton',{name:'Starting rate'}),{target:{value:'3.5'}});
    fireEvent.change(within(pool).getByRole('spinbutton',{name:'Ramp steps'}),{target:{value:'4'}});
    replies=[{body:{...VIEW,rates:{...VIEW.rates,startingRateBp:350,rampSteps:4}}}];
    fireEvent.click(within(pool).getByRole('button',{name:'Save pool settings'}));
    await waitFor(()=>expect(calls().at(-1)).toEqual({url:'/api/rep/settings/freight',method:'PUT',body:{rates:{startingRateBp:350,rateCapBp:800,lineCapBp:800,rampSteps:4,rampDays:90}}}));
    expect(await within(pool).findByText('Saved')).toBeInTheDocument();
  });

  it('will not save a cap over 50% or 13 steps, and says why',async()=>{
    await renderLoaded();
    const pool=card('Recovery pool');
    fireEvent.change(within(pool).getByRole('spinbutton',{name:'Rate cap'}),{target:{value:'51'}});
    expect(within(pool).getByRole('alert')).toHaveTextContent('Rate cap must be from 0% to 50%.');
    expect(within(pool).getByRole('button',{name:'Save pool settings'})).toBeDisabled();
    fireEvent.change(within(pool).getByRole('spinbutton',{name:'Rate cap'}),{target:{value:'8'}});
    fireEvent.change(within(pool).getByRole('spinbutton',{name:'Ramp steps'}),{target:{value:'13'}});
    expect(within(pool).getByRole('alert')).toHaveTextContent('Ramp steps must be a whole number from 1 to 12.');
  });
});

describe('Delivery cost model and fuel price',()=>{
  it('shows the fuel price in use, where it came from, its age, and the warnings',async()=>{
    await renderLoaded();
    const cost=card('Delivery cost model');
    expect(cost).toHaveTextContent('UT gasoline$3.40/gal, seeded price, 17 days old');
    expect(within(cost).getByRole('list',{name:'Fuel price warnings'})).toHaveTextContent('Fuel price is 17 days old.');
  });

  it('warns when no fuel price exists (fuel modelled at $0)',async()=>{
    await renderLoaded({...VIEW,fuel:[{state:'UT',fuelType:'diesel',cents:0,source:'none',asOf:null,ageDays:null,warnings:['No fuel price. Enter one by hand.']}],warnings:['No fuel price. Enter one by hand.']});
    const cost=card('Delivery cost model');
    expect(cost).toHaveTextContent('UT diesel$0.00/gal, no price');
    expect(within(cost).getByRole('list',{name:'Fuel price warnings'})).toHaveTextContent('No fuel price. Enter one by hand.');
  });

  it('shows the inputs in dollars and saves them in cents; a blank manual price clears it',async()=>{
    await renderLoaded();
    const cost=card('Delivery cost model');
    const field=(name:string)=>within(cost).getByRole('spinbutton',{name}) as HTMLInputElement;
    expect([field('Vehicle MPG').value,field('Wear per mile').value,field('Depreciation per mile').value,field('Driver pay per hour').value,field('Average speed').value,field('Stop time').value,field('Manual fuel price').value])
      .toEqual(['10','0.2','0.15','25','35','0','']);
    fireEvent.change(field('Vehicle MPG'),{target:{value:'12'}});
    fireEvent.change(field('Manual fuel price'),{target:{value:'3.89'}});
    fireEvent.change(within(cost).getByRole('combobox',{name:'Fuel type'}),{target:{value:'diesel'}});
    replies=[{body:{...VIEW,cost:{...VIEW.cost,mpg:12,fuelType:'diesel',fuelManualCents:389}}}];
    fireEvent.click(within(cost).getByRole('button',{name:'Save cost model'}));
    await waitFor(()=>expect(calls().at(-1)).toEqual({url:'/api/rep/settings/freight',method:'PUT',
      body:{cost:{mpg:12,fuelType:'diesel',wearCentsPerMile:20,depreciationCentsPerMile:15,driverCentsPerHour:2500,avgSpeedMph:35,stopMinutes:0,fuelManualCents:389}}}));
  });

  it('will not save MPG of 0',async()=>{
    await renderLoaded();
    const cost=card('Delivery cost model');
    fireEvent.change(within(cost).getByRole('spinbutton',{name:'Vehicle MPG'}),{target:{value:'0'}});
    expect(within(cost).getByRole('alert')).toHaveTextContent('Vehicle MPG must be above 0 and at most 200.');
    expect(within(cost).getByRole('button',{name:'Save cost model'})).toBeDisabled();
  });
});

describe('Pricing & delivery tab',()=>{
  const PRICING={scarcity_uplift_enabled:false};
  const DELIVERY={base_fee:25,per_mile:2.5,min_charge:35,free_threshold:1500,max_radius_miles:75,road_factor:1.25};

  it('shows the free delivery pricing cards to the manager only; the delivery rates and pricing cards stay for everyone',async()=>{
    const {PricingDelivery}=await import('./PricingDelivery');
    const {unmount}=render(<PricingDelivery pricing={PRICING} delivery={DELIVERY} manager={false} onPricing={vi.fn()} onDelivery={vi.fn()}/>);
    expect(screen.getByRole('heading',{name:'Delivery rates'})).toBeInTheDocument();
    expect(screen.getByRole('heading',{name:'Pricing'})).toBeInTheDocument();
    expect(screen.queryByRole('heading',{name:'Free delivery pricing'})).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    unmount();
    replies=[{body:VIEW}];
    render(<PricingDelivery pricing={PRICING} delivery={DELIVERY} manager onPricing={vi.fn()} onDelivery={vi.fn()}/>);
    expect(await screen.findByRole('heading',{name:'Free delivery pricing'})).toBeInTheDocument();
    expect(screen.getByRole('heading',{name:'Delivery rates'})).toBeInTheDocument();
  });
});
