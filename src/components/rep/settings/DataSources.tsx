'use client';
import {useSyncExternalStore} from 'react';
import {usePoll} from '@/lib/use-poll';
import type {DataSources as Sources} from '@/server/rep/settings';
import {repPageStyles as page} from '../RepPage';
import {BADGE_POLL_MS} from '../RepShell';
import {loadSources} from './api';
import s from './Settings.module.css';

// Settings > Data sources: the local SQLite demo database, which stands in for Herrick's ERP in
// the MVP (spec §6), and the ERP connection's recent sync events. Polled, so a new sync shows up.

/** The connection reads as delayed when the last sync is this old (the heartbeat runs every minute). */
export const STALE_AFTER_MS=120_000;
/** How many recent syncs the tab lists. */
export const RECENT_SYNCS=5;

const never=()=>()=>{};
/** False while server-rendering and hydrating, then true: times and "now" are read in the viewer's browser only. */
const useMounted=()=>useSyncExternalStore(never,()=>true,()=>false);

const day=(iso:string)=>new Date(`${iso.slice(0,10)}T12:00:00Z`).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});

/** A time in the viewer's zone; UTC until the page is running in the browser. */
function Time({iso,withDate=false,seconds=true}:{iso:string;withDate?:boolean;seconds?:boolean}){
  const mounted=useMounted();
  const options:Intl.DateTimeFormatOptions={hour:'numeric',minute:'2-digit',...(seconds?{second:'2-digit'}:{}),...(withDate?{month:'short',day:'numeric'}:{})};
  const text=mounted?new Date(iso).toLocaleString('en-US',options):`${new Date(iso).toLocaleString('en-US',{...options,timeZone:'UTC'})} UTC`;
  return <time dateTime={iso}>{text}</time>;
}

function Connection({lastUpdated}:{lastUpdated:string|null}){
  const mounted=useMounted();
  if(!mounted)return <span className={s.pill} data-tone="muted">Checking</span>;
  const stale=!lastUpdated||Date.now()-Date.parse(lastUpdated)>=STALE_AFTER_MS;
  return <span className={s.pill} data-tone={stale?'warn':'ok'}>{stale?'Update delayed':'Connected'}</span>;
}

export function DataSources({initial}:{initial:Sources}){
  const {data}=usePoll(loadSources,BADGE_POLL_MS);
  const {database,erp}=data??initial;
  const last=erp.events[0];
  const {records}=database;
  return <section className={`${page.card} ${s.card}`} aria-label="Data sources">
    <div className={s.source}>
      <div className={s.sourceHead}>
        <h2>Demo database</h2>
        <span className={s.pill} data-tone="muted">Sample data</span>
      </div>
      <p className={s.sourceText}>A local SQLite database stands in for BOXT’s ERP in this demo. Querent reads and writes every record here.</p>
      <dl className={s.facts}>
        <div><dt>Seeded for</dt><dd>{day(database.seed_date)}</dd></div>
        <div><dt>Records</dt><dd>{records.customers} customers, {records.items} items, {records.orders} orders, {records.quotes} quotes</dd></div>
        <div><dt>ERP records synced</dt><dd>{database.synced_at?<Time iso={database.synced_at} withDate seconds={false}/>:'Not yet'}</dd></div>
        <div><dt>Schema version</dt><dd>{database.schema_version}</dd></div>
      </dl>
    </div>
    <div className={s.source}>
      <div className={s.sourceHead}>
        <h2>BOXT Packaging ERP</h2>
        <Connection lastUpdated={erp.last_updated}/>
      </div>
      <p className={s.sourceText}>{last?<>Last sync: {last.message}, <Time iso={last.timestamp}/>.</>:'Waiting for the first sync.'}</p>
      {erp.events.length>0&&<>
        <h3 className={s.minor}>Recent syncs</h3>
        <ol className={s.events}>
          {erp.events.slice(0,RECENT_SYNCS).map(e=><li key={e.id}><span>{e.message}</span><Time iso={e.timestamp} withDate/></li>)}
        </ol>
      </>}
    </div>
  </section>;
}
