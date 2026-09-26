'use client';
import {useCallback} from 'react';
import Link from 'next/link';
import {useSearchParams} from 'next/navigation';
import type {Dashboard} from '@/lib/contracts';
import {usePoll} from '@/lib/use-poll';
import {AccessSwitches} from '@/features/access/Access';
import {DataBrowser} from '@/features/data-browser/DataBrowser';
import {DataSources} from '@/features/erp-status/Status';
import {useRepPortal,useRepScope} from './context';
import {RepPageHeader,repPageStyles as s} from './RepPage';

// Settings (spec §4). For now it holds the old supplier sections, unchanged: Customer access and
// the Data browser follow the "Viewing" picker; Data sources is supplier-wide. Task 6.1 adds Rep
// assignments, delivery rates, margin floors and the scarcity toggle.

export const SETTINGS_TABS=[
  {id:'access',label:'Customer access'},
  {id:'data',label:'Data browser'},
  {id:'sources',label:'Data sources'},
] as const;
type SettingsTab=typeof SETTINGS_TABS[number]['id'];

export function SettingsSection(){
  const {api,customers}=useRepPortal();
  const scope=useRepScope();
  const requested=useSearchParams().get('tab');
  const tab:SettingsTab=SETTINGS_TABS.find(t=>t.id===requested)?.id??'access';
  return <>
    <RepPageHeader title="Settings" description={tab==='sources'?'Herrick Industrial Supply':`Viewing ${scope.label}`}/>
    <nav className={s.tabs} aria-label="Settings sections">
      {SETTINGS_TABS.map(t=><Link key={t.id} href={scope.href(`/rep/settings?tab=${t.id}`)} aria-current={t.id===tab?'page':undefined}>{t.label}</Link>)}
    </nav>
    {tab==='access'&&<CustomerAccess key={scope.scope} scope={scope.scope}/>}
    {tab==='data'&&<DataBrowser key={scope.scope} api={api} scope={scope.scope} customers={customers}/>}
    {tab==='sources'&&<DataSources api={api}/>}
  </>;
}

function CustomerAccess({scope}:{scope:string}){
  const {api}=useRepPortal();
  const load=useCallback(()=>api.get<Dashboard>(`supplier/dashboard/${scope}`),[api,scope]);
  const {data,error,refresh}=usePoll(load);
  if(error)return <p className="error" role="alert">{error}</p>;
  if(!data)return <div className="card loading-card" role="status">Loading customer access…</div>;
  return <AccessSwitches api={api} scope={scope} rules={data.access} refresh={()=>void refresh()}/>;
}
