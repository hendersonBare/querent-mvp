'use client';
import {useCallback} from 'react';
import Link from 'next/link';
import {ArrowUpRight} from 'lucide-react';
import type {Dashboard} from '@/lib/contracts';
import {usePoll} from '@/lib/use-poll';
import {Analytics} from '@/features/analytics/Analytics';
import {useRepPortal,useRepScope} from './context';
import {RepPageHeader} from './RepPage';

/**
 * Analytics (spec §4). Until task 6.2 adds the quote stat cards and trends, this is the old
 * supplier Overview: the query analytics, following the "Viewing" picker.
 */
export function AnalyticsSection(){
  const {api}=useRepPortal();
  const scope=useRepScope();
  const load=useCallback(()=>api.get<Dashboard>(`supplier/dashboard/${scope.scope}`),[api,scope.scope]);
  const {data,error}=usePoll(load);
  return <>
    <RepPageHeader title="Analytics" description={`Customer questions Querent answered · ${scope.label}`}/>
    {error&&<p className="error" role="alert">{error}</p>}
    {!data?(error?null:<div className="card loading-card" role="status">Loading analytics…</div>):
      <div className="overview-grid">
        <div><Analytics data={data.analytics}/></div>
        <div className="overview-aside">
          <section className="card insight-card">
            <span className="insight-icon"><ArrowUpRight size={24}/></span>
            <h2>Answers for customers.<br/>Time for your team.</h2>
            <p>Let customers find the information they need, while your team focuses on the work that needs a person.</p>
            <div className="insight-stat">
              <strong>{data.access.filter(r=>r.enabled===true).length} of {data.access.length}</strong>
              <span>categories fully enabled</span>
            </div>
            <Link className="text-button" href={scope.href('/rep/settings?tab=access')}>Manage customer access <ArrowUpRight size={16}/></Link>
          </section>
        </div>
      </div>}
  </>;
}
