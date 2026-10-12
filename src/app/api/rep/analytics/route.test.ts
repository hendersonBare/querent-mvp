import {NextRequest} from 'next/server';
import {expect,it} from 'vitest';
import {useSeededDatabase} from '@/server/repository/test-db';

useSeededDatabase();

const get=async(persona?:string,query='')=>{
  const {GET}=await import('./route');
  return GET(new NextRequest(`http://127.0.0.1/api/rep/analytics${query}`,{headers:persona?{cookie:`querent-persona=${persona}`}:{}}));
};

// Brandi (the supplier persona) is the manager: her All customers covers the whole organization
// (task U1). Wasatch, her own customer, carries the seed's history, so the numbers are read for it.
it("returns the analytics for every customer the rep may read, never cached",async()=>{
  const response=await get('supplier');
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toMatch(/no-store/);
  expect((await response.json()).scope).toEqual({customer:null,customer_ids:['canyon-ridge','great-basin','uinta-facility','utah-valley-electric','wasatch','weber-basin'],rep_id:null});
  expect((await (await get('mara')).json()).scope).toEqual({customer:null,customer_ids:['canyon-ridge'],rep_id:'mara'});
  const body=await (await get('supplier','?customer=wasatch')).json();
  expect(body.scope).toMatchObject({customer:{id:'wasatch'},customer_ids:['wasatch']});
  expect(body.win_rate).toMatchObject({won:17,lost:7});
  expect(body.hours_saved).toMatchObject({hours:9,quotes_sent:27}); // 24 history quotes and the 3 aging ones (task A2)
  expect(body.weekly).toHaveLength(26);
  expect(body.queries.total_queries).toBe(40);
});

it('follows the page\'s own ?customer=: a placeholder customer reads zero, another rep\'s customer is ignored for a rep, an unknown one is All customers',async()=>{
  const greatBasin=await (await get('supplier','?customer=great-basin')).json();
  expect(greatBasin.scope).toMatchObject({customer:{id:'great-basin'},customer_ids:['great-basin']});
  expect(greatBasin.hours_saved.quotes_sent).toBe(0);
  expect(greatBasin.queries.total_queries).toBe(0);
  const canyon=await (await get('eli','?customer=canyon-ridge')).json();
  expect(canyon.scope).toEqual({customer:null,customer_ids:['utah-valley-electric','weber-basin'],rep_id:'eli'});
  const unknown=await (await get('supplier','?customer=nobody')).json();
  expect(unknown.scope.customer).toBeNull();
  const all=await (await get('mara','?customer=all')).json();
  expect(all.scope.customer_ids).toEqual(['canyon-ridge']);
});

it('asks for a workspace without a session, and refuses the customer persona',async()=>{
  expect((await get()).status).toBe(401);
  expect((await get('nobody')).status).toBe(401);
  const customer=await get('customer','?customer=wasatch');
  expect(customer.status).toBe(403);
  expect(customer.headers.get('cache-control')).toMatch(/no-store/);
  expect(await customer.json()).toEqual({detail:'Supplier access required.'});
});

// The filter (plan U6; Appendix D): reps, teams, customer, breakdown and period, with the leaderboard,
// decline reasons and untouched quotes (the old Team metrics) in the same answer.
it('takes the filter and serves the old Team metrics grouped by the breakdown; a bad filter is 400',async()=>{
  const body=await (await get('supplier','?reps=mara,eli&breakdown=rep&period=90')).json();
  expect(body.filter).toMatchObject({rep_ids:['eli','mara'],breakdown:'rep'});
  expect(body.groups.rows.map((r:{key:string})=>r.key)).toEqual(['eli','mara']);
  expect(body.groups.totals.name).toBe('Total');
  const team=await (await get('supplier','?breakdown=team')).json();
  expect(team.groups.rows.map((r:{name:string})=>r.name)).toEqual(['Inside Sales','Outside Sales']);
  const bad=await get('supplier','?teams=Nights');
  expect(bad.status).toBe(400);
  expect(await bad.json()).toEqual({detail:'Unknown team: Nights.'});
});

it('forces a rep to their own data: another rep\'s id, a team or a breakdown changes nothing (never a 403)',async()=>{
  const own=await (await get('mara')).json();
  for(const query of ['?reps=eli','?reps=eli,nora&teams=Outside%20Sales','?breakdown=customer','?reps=ghost']){
    const response=await get('mara',query);
    expect(response.status,query).toBe(200);
    const body=await response.json();
    expect(body.groups,query).toEqual(own.groups);
    expect(body.scope,query).toEqual(own.scope);
    expect(body.win_rate,query).toEqual(own.win_rate);
  }
  expect(own.groups.rows.map((r:{key:string})=>r.key)).toEqual(['mara']);
});

const csv=async(persona:string|null,query='')=>{
  const {GET}=await import('./csv/route');
  return GET(new NextRequest(`http://127.0.0.1/api/rep/analytics/csv${query}`,{headers:persona?{cookie:`querent-persona=${persona}`}:{}}));
};

it('GET /api/rep/analytics/csv: the leaderboard as the manager filtered it (Export CSV), manager only',async()=>{
  const response=await csv('supplier','?reps=brandi,mara');
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toBe('text/csv; charset=utf-8');
  expect(response.headers.get('content-disposition')).toMatch(/^attachment; filename="rep-leaderboard\.csv"/);
  expect(response.headers.get('cache-control')).toMatch(/no-store/);
  const lines=(await response.text()).replace(/^﻿/,'').trim().split('\r\n');
  expect(lines.map(l=>l.split(',')[0])).toEqual(['Rep','Brandi Gallegos','Mara Jensen','Total']);
  expect(lines[0]).toContain('Quote-to-order rate (%)');
  const byTeam=(await (await csv('supplier','?breakdown=team')).text()).replace(/^﻿/,'').trim().split('\r\n');
  expect(byTeam.map(l=>l.split(',')[0])).toEqual(['Team','Inside Sales','Outside Sales','Total']);
  expect((await csv('supplier','?reps=ghost')).status).toBe(400);
  for(const persona of ['mara','eli','customer'])expect((await csv(persona)).status).toBe(403);
  expect((await csv(null)).status).toBe(401);
});
