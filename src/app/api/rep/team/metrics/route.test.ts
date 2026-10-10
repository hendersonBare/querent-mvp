import {NextRequest} from 'next/server';
import {describe,expect,it} from 'vitest';
import {useSeededDatabase} from '@/server/repository/test-db';

// GET /api/rep/team/metrics and /api/rep/team/metrics.csv (v3 spec §5, §7; decisions 23–25; task
// D3): manager only (managerRoute). Reps and the customer get 403, no session 401; a bad window,
// rep or team is 400 with the reason. The CSV is the same rows through src/server/export/csv.ts.
useSeededDatabase();

type Persona='supplier'|'mara'|'eli'|'customer'|null;
const QUERY='from=2026-08-01T06:00:00.000Z&to=2026-10-01T06:00:00.000Z';
async function call(kind:'json'|'csv',query=QUERY,persona:Persona='supplier'){
  const headers:Record<string,string>={};
  if(persona)headers.cookie=`querent-persona=${persona}`;
  const path=kind==='json'?'metrics':'metrics.csv';
  const request=new NextRequest(`http://127.0.0.1/api/rep/team/${path}?${query}`,{headers});
  const {GET}=kind==='json'?await import('./route'):await import('../metrics.csv/route');
  return GET(request);
}

describe('who may read the Team metrics',()=>{
  it('serves the manager, never cached',async()=>{
    const response=await call('json');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toMatch(/no-store/);
    const body=await response.json();
    expect(body.rows.map((r:{rep_id:string})=>r.rep_id)).toEqual(['brandi','eli','mara','nora']);
    // The seeded Wasatch history from Aug 1 to Oct 1 (local midnights) is Brandi's.
    expect(body.rows[0].created).toBeGreaterThan(0);
    expect(body.totals.rep_id).toBeNull();
  });

  it('refuses reps and the customer with 403 and no session with 401, on both routes',async()=>{
    for(const persona of ['mara','eli','customer'] as const){
      expect((await call('json',QUERY,persona)).status).toBe(403);
      expect((await call('csv',QUERY,persona)).status).toBe(403);
    }
    expect((await call('json',QUERY,null)).status).toBe(401);
    expect((await call('csv',QUERY,null)).status).toBe(401);
  });
});

describe('validation',()=>{
  it('answers 400 with the reason for a bad window, rep or team',async()=>{
    for(const [query,detail] of [
      ['to=2026-10-01T06:00:00.000Z','Choose a date range: from and to are ISO date-times.'],
      ['from=2026-10-01T06:00:00.000Z&to=2026-08-01T06:00:00.000Z','The range must end after it starts.'],
      ['from=2025-01-01T00:00:00.000Z&to=2026-10-01T00:00:00.000Z','Pick a range of at most 400 days.'],
      [`${QUERY}&reps=mara,ghost`,'Unknown rep: ghost.'],
      [`${QUERY}&team=Nights`,'Unknown team: Nights.'],
    ] as const){
      const response=await call('json',query);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({detail});
      expect((await call('csv',query)).status).toBe(400);
    }
  });
});

describe('GET /api/rep/team/metrics.csv',()=>{
  it('downloads the leaderboard: one line per selected rep plus the totals',async()=>{
    const response=await call('csv',`${QUERY}&reps=brandi,mara`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(response.headers.get('content-disposition')).toMatch(/^attachment; filename="team-metrics\.csv"/);
    expect(response.headers.get('cache-control')).toMatch(/no-store/);
    const lines=(await response.text()).replace(/^﻿/,'').trim().split('\r\n');
    expect(lines.map(l=>l.split(',')[0])).toEqual(['Rep','Brandi Gallegos','Mara Jensen','Total']);
  });
});
