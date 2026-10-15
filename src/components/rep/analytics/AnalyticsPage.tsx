'use client';
import {useCallback,useEffect,useState,type ReactNode} from 'react';
import {usePathname,useRouter,useSearchParams} from 'next/navigation';
import type {AnalyticsPage as PageData} from '@/server/analytics';
import {Icon} from '@/components/ui/Icon';
import {cx} from '@/components/ui/cx';
import type {TablePrefs} from '@/components/ui/table-prefs';
import {usePoll} from '@/lib/use-poll';
import {useRepPortal} from '../context';
import {RepPageHeader} from '../RepPage';
import {customerFilter,withCustomer} from '../scope';
import {DEFAULT_PERIOD,ManagerFilter,RepFilter,type RepFilterValue} from './AnalyticsFilters';
import {CustomerQuestions} from './CustomerQuestions';
import {Overview} from './Overview';
import {DeclineReasons,Leaderboard,UntouchedTable,type PeriodChoice} from './TeamTabs';
import {Tabs} from './parts';
import {NO_FILTER,analyticsQuery,customWindow,dayInput,presetWindow,type AnalyticsFilter,type TeamWindow} from './window';
import s from './Analytics.module.css';

// Analytics (spec §4; plan U6; Part 1 section 6). The manager's page (C_ANBase to C_AN8) has five tabs:
// Overview, Rep leaderboard (with Export CSV), Decline reasons, Untouched quotes and Customer questions,
// and a filter of reps, teams, a customer and the breakdown; the leaderboard's title bar picks the window.
// A rep's My Analytics (C_RAN1 to C_RAN5) has no leaderboard tab, and its filter picks one of their own
// customers and the period. Everything comes from GET /api/rep/analytics, which only ever gives a rep
// their own data. The customer stays in the URL (?customer=, the page's own filter, task U1).

/** How often the numbers are re-read, so a quote sent or accepted elsewhere shows up without a reload. */
export const ANALYTICS_POLL_MS=15_000;
/** Export CSV goes to the file (a test stubs it). */
export const download={to:(url:string)=>window.location.assign(url)};

type TabId='overview'|'leaderboard'|'declines'|'untouched'|'questions';
const MANAGER_TABS:readonly {value:TabId;label:string}[]=[
  {value:'overview',label:'Overview'},{value:'leaderboard',label:'Rep leaderboard'},{value:'declines',label:'Decline reasons'},
  {value:'untouched',label:'Untouched quotes'},{value:'questions',label:'Customer questions'},
];
const REP_TABS=MANAGER_TABS.filter(t=>t.value!=='leaderboard');
const tabId=(value:TabId)=>`analytics-tab-${value}`;

const leave=()=>window.location.assign('/');

async function loadAnalytics(query:string):Promise<PageData>{
  const response=await fetch(`/api/rep/analytics?${query}`,{cache:'no-store'});
  if(response.status===401||response.status===403){leave();throw new Error('Choose a demo workspace.');}
  const body=await response.json().catch(()=>null);
  if(!response.ok)throw new Error(typeof body?.detail==='string'?body.detail:'Unable to load analytics. Try again in a moment.');
  return body as PageData;
}

/** The window: a preset's last N local days, or a custom range (the last good window while its days are unfinished). */
function windowFor({period,start,end}:Pick<RepFilterValue,'period'|'start'|'end'>,last:TeamWindow):TeamWindow{
  if(period!=='custom')return presetWindow(Number(period));
  const custom=customWindow(start,end);
  return custom.ok?custom.window:last;
}

function initialPeriod():RepFilterValue{
  const w=presetWindow(Number(DEFAULT_PERIOD));
  return {customer:null,period:DEFAULT_PERIOD,start:dayInput(new Date(w.from)),end:dayInput(new Date(Date.parse(w.to)-1))};
}

export function AnalyticsPage({prefs={}}:{prefs?:Record<string,TablePrefs|null>}){
  const {rep}=useRepPortal();
  const manager=!!rep.manager;
  const params=useSearchParams(),router=useRouter(),pathname=usePathname();
  const [filter,setFilter]=useState<AnalyticsFilter>(()=>({...NO_FILTER,customer:customerFilter(params)}));
  const [period,setPeriod]=useState<RepFilterValue>(initialPeriod);
  const [range,setRange]=useState<TeamWindow>(()=>presetWindow(Number(DEFAULT_PERIOD)));
  useEffect(()=>setRange(last=>{const next=windowFor(period,last);return next.from===last.from&&next.to===last.to?last:next;}),[period]);
  const [tab,setTab]=useState<TabId>('overview');
  const query=analyticsQuery(filter,range);

  const load=useCallback(()=>loadAnalytics(query),[query]);
  const {data:fresh,error,refresh}=usePoll(load,ANALYTICS_POLL_MS);
  const [shown,setShown]=useState<PageData|null>(null);
  useEffect(()=>{if(fresh)setShown(fresh);},[fresh]);
  const data=fresh??shown,stale=!fresh&&shown!==null;

  /** Applies a filter: the customer goes to the URL; an unchanged query reads the numbers again. */
  function apply(next:AnalyticsFilter){
    setFilter(next);
    router.replace(withCustomer(pathname,next.customer),{scroll:false});
    if(analyticsQuery(next,range)===query)void refresh();
  }
  const tabs=manager?MANAGER_TABS:REP_TABS;
  const current=tabs.some(t=>t.value===tab)?tab:'overview';
  const customer=data?.scope.customer??null;
  const subtitle=`Quotes and customer questions for ${customer?customer.name:manager?'the whole organization':'your customers'}`;
  const options=data?.options??{reps:[],teams:[],customers:[]};

  // No frame: the custom range's two days under the leaderboard's note, while Custom is picked.
  const custom=period.period==='custom'&&<div className={s.customRange}>
    <label>From <input type="date" className={s.dateInput} value={period.start} onChange={e=>setPeriod(p=>({...p,start:e.target.value}))}/></label>
    <label>To <input type="date" className={s.dateInput} value={period.end} onChange={e=>setPeriod(p=>({...p,end:e.target.value}))}/></label>
  </div>;

  return <>
    <RepPageHeader title={manager?'Analytics':'My Analytics'} description={subtitle}>
      {manager
        ?<ManagerFilter value={filter} onApply={apply} reps={options.reps} teams={options.teams} customers={options.customers}/>
        :<RepFilter value={{...period,customer:filter.customer}} customers={options.customers}
          onApply={next=>{setPeriod({...next,customer:null});apply({...filter,customer:next.customer});}}/>}
      {manager&&current==='leaderboard'&&<button type="button" className={s.export} onClick={()=>download.to(`/api/rep/analytics/csv?${query}`)}>
        <Icon name="download" size={15}/>Export CSV
      </button>}
    </RepPageHeader>
    <Tabs tabs={tabs} value={current} onChange={setTab} idFor={tabId}/>
    <div className={cx('ui-root',s.body)} role="tabpanel" aria-labelledby={tabId(current)} data-stale={stale||undefined} aria-busy={stale}>
      {error&&<p className={s.error} role="alert">{error}</p>}
      {!data?(error?null:<div role="status">Loading analytics.</div>):<Tab tab={current} data={data} manager={manager} prefs={prefs}
        period={period.period} onPeriod={choice=>setPeriod(p=>({...p,period:choice}))} custom={custom}/>}
    </div>
  </>;
}

function Tab({tab,data,manager,prefs,period,onPeriod,custom}:{tab:TabId;data:PageData;manager:boolean;prefs:Record<string,TablePrefs|null>;
  period:PeriodChoice;onPeriod:(choice:PeriodChoice)=>void;custom:ReactNode}){
  // The rows' window is the one the server answered for (the browser's own midnights, OA-19).
  const window=data.filter.window;
  switch(tab){
    case 'leaderboard':return <Leaderboard groups={data.groups} window={window} period={period} onPeriod={onPeriod} custom={custom} prefs={prefs['analytics-leaderboard']}/>;
    case 'declines':return <DeclineReasons groups={data.groups} window={window} manager={manager} prefs={prefs['analytics-declines']}/>;
    case 'untouched':return <UntouchedTable groups={data.groups} manager={manager} prefs={prefs['analytics-untouched']}/>;
    case 'questions':return <CustomerQuestions questions={data.questions} queries={data.queries} access={data.access} manager={manager}
      manageHref={withCustomer('/rep/settings?tab=access',data.scope.customer?.id??null)} prefs={prefs['analytics-queries']}/>;
    default:return <Overview data={data} prefs={prefs}/>;
  }
}
