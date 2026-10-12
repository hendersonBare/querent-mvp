import {fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {FreightSettingsView} from '@/server/rep/freight-settings';
import {ENABLED,FLAGS_ON,PREVIEW,VIEW} from './test-fixtures';

// The feature-flagged sections of Settings > Pricing and delivery (v3 spec §4.3, §4.6, §4.7, §6; decisions
// 28 to 31, 35, 36, 48; plan U8; C_S5, C_S6, C_S7): Free delivery pricing (the toggle, locked until the
// impact preview has been viewed, the ramp-in and the preview dialog), the Recovery pool and the Delivery
// cost model. Each renders only while its flag is on (Settings.test.tsx covers the flags).

const {FreightSections}=await import('./FreeDeliveryPricing');

type Reply={status?:number;body:unknown};
let replies:Reply[]=[];
const fetchMock=vi.fn(async(_input:RequestInfo|URL,_init?:RequestInit)=>{
  const next=replies.shift()??{body:{detail:'Not found.'},status:404};
  return Response.json(next.body,{status:next.status??200});
});
const calls=()=>fetchMock.mock.calls.map(([url,init])=>({url:String(url),method:init?.method??'GET',body:init?.body?JSON.parse(String(init.body)):undefined}));

beforeEach(()=>{replies=[];fetchMock.mockClear();vi.stubGlobal('fetch',fetchMock);});
afterEach(()=>vi.unstubAllGlobals());

async function renderLoaded(view:FreightSettingsView=VIEW){
  replies=[{body:view}];
  render(<FreightSections flags={FLAGS_ON}/>);
  await screen.findByRole('heading',{name:'Free delivery pricing'});
}
const toggle=()=>screen.getByRole('switch',{name:'Free delivery pricing'});
const card=(name:string)=>screen.getByRole('region',{name});

describe('Free delivery pricing (C_S5)',()=>{
  it('loads from GET /api/rep/settings/freight and keeps the toggle locked until the impact preview is viewed',async()=>{
    await renderLoaded();
    expect(calls()[0]).toMatchObject({url:'/api/rep/settings/freight',method:'GET'});
    expect(card('Free delivery pricing')).toHaveTextContent('Delivery quotes show Freight $0.00. The delivery cost is recovered in item prices at the pool rate, ramped in. Contract lines and quotes under the free-delivery threshold carry none.');
    expect(toggle()).toBeDisabled();
    expect(toggle()).toHaveAttribute('aria-checked','false');
    expect(card('Free delivery pricing')).toHaveTextContent('View the impact preview before turning it on.');
    // The ramp schedule: 3 steps over 90 days at a third, two thirds and all of the rate.
    expect(card('Free delivery pricing')).toHaveTextContent('Ramp-inThe rate steps up over 90 days in 3 steps, to 3.0% at the last step.');
    const ramp=within(card('Free delivery pricing')).getByRole('table',{name:'Ramp-in schedule'});
    expect(within(ramp).getAllByRole('columnheader').map(h=>h.textContent)).toEqual([':: Step',':: Starts',':: Rate']);
    expect(within(ramp).getAllByRole('row').slice(1).map(r=>r.textContent)).toEqual(['Step 1 of 3From day 01.0%','Step 2 of 3From day 302.0%','Step 3 of 3From day 603.0%']);
  });

  it('opens the impact preview (quotes affected and the change per category in dollars), then unlocks the toggle and enables at ramp step 1',async()=>{
    await renderLoaded();
    expect(card('Free delivery pricing')).toHaveTextContent('Impact previewHow many recent delivery quotes would carry recovery, and the average line price change by category at the first step and at the full rate.');
    replies=[{body:PREVIEW},{body:{...VIEW,previewViewedAt:PREVIEW.viewedAt,previewValid:true}}];
    fireEvent.click(screen.getByRole('button',{name:'View impact preview'}));
    const dialog=await screen.findByRole('dialog',{name:'Impact preview'});
    expect(dialog).toHaveTextContent('Based on the last 5 delivery quotes.');
    const table=within(dialog).getByRole('table',{name:'Average change per line price'});
    expect(within(table).getAllByRole('row').map(r=>r.textContent)).toEqual([
      ':: Category:: Quotes affected:: Step 1 (1.0%):: Full rate (3.0%)','Fasteners2 of 5+$0.12+$0.38','Tools1 of 5+$0.15+$0.48',
    ]);
    expect(dialog).toHaveTextContent('Average change per line price.');
    expect(calls().map(c=>`${c.method} ${c.url}`)).toEqual(['GET /api/rep/settings/freight','GET /api/rep/settings/freight/preview','GET /api/rep/settings/freight']);
    fireEvent.click(within(dialog).getByRole('button',{name:'Close'}));
    expect(screen.queryByRole('dialog',{name:'Impact preview'})).not.toBeInTheDocument();
    await waitFor(()=>expect(toggle()).toBeEnabled());
    replies=[{body:ENABLED}];
    fireEvent.click(toggle());
    await waitFor(()=>expect(toggle()).toHaveAttribute('aria-checked','true'));
    expect(calls().at(-1)).toEqual({url:'/api/rep/settings/freight',method:'PUT',body:{enabled:true}});
    expect(card('Free delivery pricing')).toHaveTextContent('Turning it off reprices draft quotes on their next open. Sent quotes keep their prices.');
    expect(card('Free delivery pricing')).toHaveTextContent('On since Oct 10, 2026');
    expect(card('Recovery pool')).toHaveTextContent('1.0%, ramp step 1 of 3');
    const now=within(card('Free delivery pricing')).getAllByRole('row')[1];
    expect(now).toHaveTextContent('Step 1 of 3 NOWFrom day 0Oct 10, 20261.0%');
  });

  it('the preview dialog closes with Escape and when nothing would change says so',async()=>{
    await renderLoaded();
    replies=[{body:{...PREVIEW,affected:0,categories:[]}},{body:VIEW}];
    fireEvent.click(screen.getByRole('button',{name:'View impact preview'}));
    const dialog=await screen.findByRole('dialog',{name:'Impact preview'});
    expect(dialog).toHaveTextContent('No line prices would change.');
    fireEvent.keyDown(dialog,{key:'Escape'});
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('says why when the server refuses to enable (409 preview_required)',async()=>{
    await renderLoaded({...VIEW,previewValid:true,previewViewedAt:'2026-10-10T00:00:00.000Z'});
    replies=[{status:409,body:{detail:'View the impact preview before turning on free delivery pricing.',code:'preview_required'}}];
    fireEvent.click(toggle());
    expect(await within(card('Free delivery pricing')).findByRole('alert')).toHaveTextContent('View the impact preview before turning on free delivery pricing.');
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

describe('Recovery pool (C_S6)',()=>{
  it('shows the starting rate against the pool, the eligible count, the cap, the ramp step and the 90-day cost and recovery',async()=>{
    await renderLoaded();
    const pool=card('Recovery pool');
    expect(pool).toHaveTextContent('Last 90 days of modelled delivery cost over the goods value of accepted delivery quotes. The starting rate applies until 20 are in.');
    expect(pool).toHaveTextContent('Recovery rateStarting rate 3.0%: 4 of 20 eligible quotes, not enough to compute the pool yet');
    expect(pool).toHaveTextContent('Rate cap8.0%');
    expect(pool).toHaveTextContent('Rate in forceOff');
    expect(pool).toHaveTextContent('Modelled delivery cost, last 90 days$168.52');
    expect(pool).toHaveTextContent('Recovered in prices, last 90 days$0.00');
    expect(pool).toHaveTextContent('A quote freezes the rate in force when it is created. Sent quotes keep their prices.');
  });

  it('shows the computed pool rate once 20 quotes are in the window',async()=>{
    await renderLoaded({...ENABLED,pool:{...ENABLED.pool,computedBp:400,count:24,usingPool:true,baseBp:400,step:2,rateInForceBp:267}});
    expect(card('Recovery pool')).toHaveTextContent('Pool rate 4.0% from 24 eligible quotes (starting rate 3.0%)');
    expect(card('Recovery pool')).toHaveTextContent('Rate in force2.7%, ramp step 2 of 3');
  });

  it('saves the starting rate, caps and ramp in percent and days, units under the labels',async()=>{
    await renderLoaded();
    const pool=card('Recovery pool');
    for(const text of ['Starting ratePercent of goods value','Rate capPercent, at most',"Per-line capPercent over a line's price, at most",'Ramp stepsNumber of steps','Ramp daysDays'])expect(pool).toHaveTextContent(text);
    fireEvent.change(within(pool).getByRole('textbox',{name:'Starting rate'}),{target:{value:'3.5'}});
    fireEvent.change(within(pool).getByRole('textbox',{name:'Ramp steps'}),{target:{value:'4'}});
    replies=[{body:{...VIEW,rates:{...VIEW.rates,startingRateBp:350,rampSteps:4}}}];
    fireEvent.click(within(pool).getByRole('button',{name:'Save pool settings'}));
    await waitFor(()=>expect(calls().at(-1)).toEqual({url:'/api/rep/settings/freight',method:'PUT',body:{rates:{startingRateBp:350,rateCapBp:800,lineCapBp:800,rampSteps:4,rampDays:90}}}));
    expect(await within(pool).findByText('Saved')).toBeInTheDocument();
  });

  it('will not save a cap over 50% or 13 steps, and says why',async()=>{
    await renderLoaded();
    const pool=card('Recovery pool');
    fireEvent.change(within(pool).getByRole('textbox',{name:'Rate cap'}),{target:{value:'51'}});
    expect(within(pool).getByRole('alert')).toHaveTextContent('Rate cap must be from 0% to 50%.');
    expect(within(pool).getByRole('button',{name:'Save pool settings'})).toBeDisabled();
    fireEvent.change(within(pool).getByRole('textbox',{name:'Rate cap'}),{target:{value:'8'}});
    fireEvent.change(within(pool).getByRole('textbox',{name:'Ramp steps'}),{target:{value:'13'}});
    expect(within(pool).getByRole('alert')).toHaveTextContent('Ramp steps must be a whole number from 1 to 12.');
  });
});

describe('Delivery cost model and fuel price (C_S6)',()=>{
  it('shows the fuel price in use, where it came from, its age, and the warnings',async()=>{
    await renderLoaded();
    const cost=card('Delivery cost model');
    expect(cost).toHaveTextContent("Fuel, wear, depreciation and the driver's time for the round trip, plus any stop time.");
    expect(cost).toHaveTextContent('UT gasoline$3.40/gal, seeded price, 17 days old');
    expect(cost).toHaveTextContent('Fuel price is 17 days old.');
    expect(cost).toHaveTextContent('A quote keeps the modelled cost measured when it was created, or when its branch or ship-to changed.');
  });

  it('warns when no fuel price exists (fuel modelled at $0)',async()=>{
    await renderLoaded({...VIEW,fuel:[{state:'UT',fuelType:'diesel',cents:0,source:'none',asOf:null,ageDays:null,warnings:['No fuel price. Enter one by hand.']}],warnings:['No fuel price. Enter one by hand.']});
    const cost=card('Delivery cost model');
    expect(cost).toHaveTextContent('UT diesel$0.00/gal, no price');
    expect(cost).toHaveTextContent('No fuel price. Enter one by hand.');
  });

  it('shows the inputs in dollars and saves them in cents; a blank manual price clears it',async()=>{
    await renderLoaded();
    const cost=card('Delivery cost model');
    const field=(name:string)=>within(cost).getByRole('textbox',{name}) as HTMLInputElement;
    expect([field('Vehicle MPG').value,field('Wear per mile').value,field('Depreciation per mile').value,field('Driver pay per hour').value,field('Average speed').value,field('Stop time').value,field('Manual fuel price').value])
      .toEqual(['10','0.2','0.15','25','35','0','']);
    for(const text of ['Vehicle MPGMiles per gallon','Manual fuel pricePer gallon. Blank uses the state price','Average speedMiles per hour','Stop timeMinutes per delivery'])expect(cost).toHaveTextContent(text);
    fireEvent.change(field('Vehicle MPG'),{target:{value:'12'}});
    fireEvent.change(field('Manual fuel price'),{target:{value:'3.89'}});
    fireEvent.click(within(cost).getByRole('button',{name:'Fuel type: Gasoline (state price)'}));
    fireEvent.mouseDown(within(cost).getByRole('option',{name:'Diesel (manual price)'}));
    replies=[{body:{...VIEW,cost:{...VIEW.cost,mpg:12,fuelType:'diesel',fuelManualCents:389}}}];
    fireEvent.click(within(cost).getByRole('button',{name:'Save cost model'}));
    await waitFor(()=>expect(calls().at(-1)).toEqual({url:'/api/rep/settings/freight',method:'PUT',
      body:{cost:{mpg:12,fuelType:'diesel',wearCentsPerMile:20,depreciationCentsPerMile:15,driverCentsPerHour:2500,avgSpeedMph:35,stopMinutes:0,fuelManualCents:389}}}));
  });

  it('will not save MPG of 0',async()=>{
    await renderLoaded();
    const cost=card('Delivery cost model');
    fireEvent.change(within(cost).getByRole('textbox',{name:'Vehicle MPG'}),{target:{value:'0'}});
    expect(within(cost).getByRole('alert')).toHaveTextContent('Vehicle MPG must be above 0 and at most 200.');
    expect(within(cost).getByRole('button',{name:'Save cost model'})).toBeDisabled();
  });
});
