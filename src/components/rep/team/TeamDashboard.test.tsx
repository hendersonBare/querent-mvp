import type {AnchorHTMLAttributes,ReactNode} from 'react';
import {fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {TeamQuoteFact} from '@/domain';
import {AGING_DEFAULTS} from '@/server/quotes';
import {teamMetricRows,type MetricsRep} from '@/server/team/metrics';
import type {TeamMetrics} from '@/server/team/service';

// The Team dashboard (v3 spec §6 Team, §7; decisions 23–25; task D3) against canned API answers:
// the rep multi-select, team filter, presets and custom range, the leaderboard with its totals row
// and drill-down links, the decline reasons with the Other notes, the untouched table, Export CSV.

vi.mock('next/link',()=>({default:({href,children,...rest}:AnchorHTMLAttributes<HTMLAnchorElement>&{href:string;children?:ReactNode})=><a href={href} {...rest}>{children}</a>}));
const {TeamDashboard}=await import('./TeamDashboard');

const REPS:MetricsRep[]=[
  {id:'brandi',name:'Brandi Gallegos',team:'Inside Sales',active:true},
  {id:'eli',name:'Eli Porter',team:'Outside Sales',active:true},
  {id:'mara',name:'Mara Jensen',team:'Inside Sales',active:true},
  {id:'zed',name:'Zed Former',team:'Outside Sales',active:false},
];
const TEAMS=['Inside Sales','Outside Sales'];
const NOW=new Date(2026,9,10,15,0);
const base={customer_id:'canyon-ridge',customer_name:'Canyon Ridge Builders',sent_at:null,responded_at:null,valid_until:null,fulfillment:'will_call' as const,last_rep_touch_at:null,customer_viewed_at:null,decline_reason:null,decline_note:null,
  declined_at:null,sent_total:null,draft_total:null,priced_subtotal:0,priced_cost:0,recovered_cents:0,modelled_freight_cents:null,suggestion_lines:0,upsell_lines:0,suggestions_offered:0};
const FACTS:TeamQuoteFact[]=[
  {...base,id:'q1',quote_number:'Q-1',rep_id:'mara',status:'accepted',created_at:'2026-10-01T15:00:00.000Z',sent_total:100,priced_subtotal:100,priced_cost:70},
  {...base,id:'q2',quote_number:'Q-2',rep_id:'mara',status:'declined',created_at:'2026-10-02T15:00:00.000Z',sent_total:50,decline_reason:'other',decline_note:'Found it cheaper online',declined_at:'2026-10-03T15:00:00.000Z'},
  {...base,id:'q3',quote_number:'Q-3',rep_id:'eli',status:'declined',created_at:'2026-10-02T15:00:00.000Z',sent_total:20,decline_reason:'price_too_high',declined_at:'2026-10-03T15:00:00.000Z'},
  {...base,id:'q4',quote_number:'Q-4',rep_id:'eli',status:'ready_for_review',created_at:'2026-10-08T15:00:00.000Z'},
];

/** The API's answer for a query: the fixture's metrics for the ticked reps. */
function answer(url:URL):TeamMetrics{
  const ids=url.searchParams.get('reps')?.split(',')??[];
  const team=url.searchParams.get('team');
  const reps=REPS.filter(r=>ids.includes(r.id)&&(!team||r.team===team));
  const now=NOW.toISOString();
  return {as_of:now,window:{from:url.searchParams.get('from')!,to:url.searchParams.get('to')!},selected:{rep_ids:reps.map(r=>r.id),team},
    ...teamMetricRows(reps,FACTS,[],{now,thresholds:AGING_DEFAULTS}),options:{reps:REPS,teams:TEAMS}};
}
const fetchMock=vi.fn(async(input:RequestInfo|URL)=>{
  const url=new URL(String(input),'http://127.0.0.1');
  if(url.pathname==='/api/rep/team/metrics')return Response.json(answer(url));
  return Response.json({detail:'Not found.'},{status:404});
});
const lastQuery=()=>new URL(String(fetchMock.mock.calls.at(-1)![0]),'http://127.0.0.1').searchParams;
const localMidnight=(y:number,m:number,d:number)=>new Date(y,m-1,d).toISOString();

beforeEach(()=>{fetchMock.mockClear();vi.stubGlobal('fetch',fetchMock);vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(NOW);});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});

const renderDashboard=()=>render(<TeamDashboard reps={REPS} teams={TEAMS}/>);
const leaderboard=()=>screen.getByRole('table',{name:/Leaderboard/});
const bodyRows=()=>within(leaderboard()).getAllByRole('row').slice(1);

describe('defaults',()=>{
  it('asks for the last 30 days (local midnights) for every active rep, and shows a row per rep plus a totals row',async()=>{
    renderDashboard();
    await waitFor(()=>expect(bodyRows()).toHaveLength(4));
    expect(Object.fromEntries(lastQuery())).toEqual({from:localMidnight(2026,9,11),to:localMidnight(2026,10,11),reps:'brandi,eli,mara'});
    expect(bodyRows().map(r=>within(r).getByRole('rowheader').textContent)).toEqual(['Brandi Gallegos','Eli Porter','Mara Jensen','Total']);
    const totals=bodyRows()[3];
    expect(totals).toHaveAttribute('data-totals');
    expect(within(totals).getByRole('cell',{name:'4 created'})).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'30 days'})).toHaveAttribute('aria-pressed','true');
    // Zed is inactive: listed for history, not ticked by default.
    expect(screen.getByRole('checkbox',{name:'Zed Former (inactive)'})).not.toBeChecked();
    expect(screen.getByRole('checkbox',{name:'Mara Jensen'})).toBeChecked();
  });
});

describe('the rep multi-select and team filter',()=>{
  it('compares any set of ticked reps, and asks for nothing with none ticked',async()=>{
    renderDashboard();
    await waitFor(()=>expect(bodyRows()).toHaveLength(4));
    fireEvent.click(screen.getByRole('checkbox',{name:'Brandi Gallegos'}));
    await waitFor(()=>expect(bodyRows()).toHaveLength(3));
    expect(lastQuery().get('reps')).toBe('eli,mara');
    expect(within(bodyRows()[2]).getByRole('cell',{name:'4 created'})).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Clear reps'}));
    expect(await screen.findByText('Tick at least one rep to compare.')).toBeInTheDocument();
    const calls=fetchMock.mock.calls.length;
    fireEvent.click(screen.getByRole('button',{name:'All active reps'}));
    await waitFor(()=>expect(fetchMock.mock.calls.length).toBeGreaterThan(calls));
    expect(lastQuery().get('reps')).toBe('brandi,eli,mara');
  });

  it('narrows to a team label',async()=>{
    renderDashboard();
    await waitFor(()=>expect(bodyRows()).toHaveLength(4));
    fireEvent.change(screen.getByRole('combobox',{name:'Team'}),{target:{value:'Inside Sales'}});
    await waitFor(()=>expect(bodyRows()).toHaveLength(3));
    expect(lastQuery().get('team')).toBe('Inside Sales');
    expect(screen.queryByRole('checkbox',{name:'Eli Porter'})).toBeNull();
  });
});

describe('presets and a custom range',()=>{
  it('7 and 90 days, then a custom range with both days included',async()=>{
    renderDashboard();
    await waitFor(()=>expect(fetchMock).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button',{name:'7 days'}));
    await waitFor(()=>expect(lastQuery().get('from')).toBe(localMidnight(2026,10,4)));
    expect(screen.getByRole('button',{name:'7 days'})).toHaveAttribute('aria-pressed','true');
    fireEvent.click(screen.getByRole('button',{name:'90 days'}));
    await waitFor(()=>expect(lastQuery().get('from')).toBe(localMidnight(2026,7,13)));
    fireEvent.click(screen.getByRole('button',{name:'Custom'}));
    fireEvent.change(screen.getByLabelText('From'),{target:{value:'2026-09-01'}});
    fireEvent.change(screen.getByLabelText('To'),{target:{value:'2026-09-30'}});
    await waitFor(()=>expect(Object.fromEntries(lastQuery())).toMatchObject({from:localMidnight(2026,9,1),to:localMidnight(2026,10,1)}));
    fireEvent.change(screen.getByLabelText('To'),{target:{value:'2026-08-01'}});
    expect(await screen.findByText('The end date must be on or after the start date.')).toBeInTheDocument();
  });
});

describe('drill-down, decline reasons, untouched reasons and the CSV',()=>{
  it('links counts and rows to the manager’s filtered Quotes list, with no ?scope=all',async()=>{
    renderDashboard();
    await waitFor(()=>expect(bodyRows()).toHaveLength(4));
    const window=`from=${encodeURIComponent(localMidnight(2026,9,11))}&to=${encodeURIComponent(localMidnight(2026,10,11))}`;
    const mara=bodyRows()[2];
    expect(within(mara).getByRole('link',{name:'Mara Jensen'})).toHaveAttribute('href',`/rep/quotes?rep=mara&${window}`);
    expect(within(mara).getByRole('link',{name:'1 declined'})).toHaveAttribute('href',`/rep/quotes?rep=mara&${window}&status=declined`);
    expect(within(bodyRows()[3]).getByRole('link',{name:'Total'})).toHaveAttribute('href',`/rep/quotes?rep=brandi%2Celi%2Cmara&${window}`);
  });

  it('shows each decline reason with its count, and the Other text',async()=>{
    renderDashboard();
    const panel=await screen.findByRole('region',{name:'Decline reasons'});
    await waitFor(()=>expect(within(panel).getByText('Price too high')).toBeInTheDocument());
    expect(within(panel).getByRole('row',{name:/Price too high 1/})).toBeInTheDocument();
    expect(within(panel).getByRole('row',{name:/Other 1/})).toBeInTheDocument();
    const notes=within(panel).getByRole('list',{name:'Other reasons in their words'});
    expect(notes).toHaveTextContent('Found it cheaper online');
    expect(within(notes).getByRole('link',{name:'Q-2'})).toHaveAttribute('href','/rep/quotes/Q-2');
  });

  it('shows the untouched reasons per rep and offers the CSV for the same filters',async()=>{
    renderDashboard();
    const table=await screen.findByRole('table',{name:/Why quotes went untouched/});
    await waitFor(()=>expect(within(table).getAllByRole('row')).toHaveLength(5));
    expect(within(table).getAllByRole('columnheader').map(h=>h.textContent)).toEqual(['Rep','Draft never opened','Draft opened but never sent','Changes requested but never revised',
      'Sent but never opened','Sent and opened but no reply','Expired with no response']);
    const csv=screen.getByRole('link',{name:'Export CSV'});
    expect(csv).toHaveAttribute('href',`/api/rep/team/metrics.csv?${new URLSearchParams({from:localMidnight(2026,9,11),to:localMidnight(2026,10,11),reps:'brandi,eli,mara'})}`);
    expect(csv).toHaveAttribute('download');
  });
});
