import {describe,expect,it} from 'vitest';
import type {MetricsRep} from '@/server/team/metrics';
import {parseAnalyticsQuery} from './query';

// GET /api/rep/analytics's filter (plan U6; Part 1 section 6; Appendix D): reps, teams, a customer,
// a breakdown and a period. Pure: the reader, the reps and `now` are passed in.

const REPS:MetricsRep[]=[
  {id:'brandi',name:'Brandi Gallegos',team:'Inside Sales',active:true},
  {id:'eli',name:'Eli Porter',team:'Outside Sales',active:true},
  {id:'mara',name:'Mara Jensen',team:'Inside Sales',active:true},
  {id:'nora',name:'Nora Chen',team:'Outside Sales',active:true},
  {id:'old',name:'Old Rep',team:null,active:false},
];
const NOW='2026-10-12T15:00:00.000Z';
const manager={repId:'brandi',manager:true};
const mara={repId:'mara',manager:false};
const parse=(query:string,reader=manager)=>parseAnalyticsQuery(new URLSearchParams(query),{reader,reps:REPS,now:NOW});
const ok=(query:string,reader=manager)=>{const r=parse(query,reader);if(!r.ok)throw new Error(r.detail);return r.query;};

describe('the manager',()=>{
  it('reads the whole organization by default: every rep, the active ones in the cohort, broken down by the whole organization, the last 30 UTC days',()=>{
    expect(ok('')).toEqual({
      reps:[],teams:[],repIds:null,cohortRepIds:['brandi','eli','mara','nora'],customerId:null,breakdown:'org',
      window:{from:'2026-09-13T00:00:00.000Z',to:'2026-10-13T00:00:00.000Z'},
    });
  });

  it('narrows to any mix of reps and teams, in rep order, with a team counting its members',()=>{
    const q=ok('reps=nora&teams=Inside%20Sales');
    expect(q.reps).toEqual(['nora']);
    expect(q.teams).toEqual(['Inside Sales']);
    expect(q.repIds).toEqual(['brandi','mara','nora']);
    expect(q.cohortRepIds).toEqual(['brandi','mara','nora']);
    // An inactive rep picked by name is in (Team history).
    expect(ok('reps=old').repIds).toEqual(['old']);
    expect(ok('teams=Outside%20Sales,Inside%20Sales').repIds).toEqual(['brandi','eli','mara','nora']);
  });

  it('takes the customer and the breakdown',()=>{
    expect(ok('customer=wasatch').customerId).toBe('wasatch');
    for(const breakdown of ['org','rep','team','customer'] as const)expect(ok(`breakdown=${breakdown}`).breakdown).toBe(breakdown);
  });

  it('takes the browser\'s window (its own midnights), or a period of 7, 30 or 90 UTC days',()=>{
    expect(ok('from=2026-09-01T06:00:00.000Z&to=2026-10-01T06:00:00.000Z').window).toEqual({from:'2026-09-01T06:00:00.000Z',to:'2026-10-01T06:00:00.000Z'});
    expect(ok('period=7').window).toEqual({from:'2026-10-06T00:00:00.000Z',to:'2026-10-13T00:00:00.000Z'});
    expect(ok('period=90').window).toEqual({from:'2026-07-15T00:00:00.000Z',to:'2026-10-13T00:00:00.000Z'});
  });

  it('refuses an unknown rep, team, breakdown or period, and a bad window, with the reason',()=>{
    for(const [query,detail] of [
      ['reps=mara,ghost','Unknown rep: ghost.'],
      ['teams=Nights','Unknown team: Nights.'],
      ['breakdown=region','Unknown breakdown: region.'],
      ['period=14','Pick a period of 7, 30 or 90 days, or a custom range.'],
      ['from=2026-10-01T06:00:00.000Z','Choose a date range: from and to are ISO date-times.'],
      ['from=2026-10-01T06:00:00.000Z&to=2026-08-01T06:00:00.000Z','The range must end after it starts.'],
      ['from=2025-01-01T00:00:00.000Z&to=2026-10-01T00:00:00.000Z','Pick a range of at most 400 days.'],
    ] as const)expect(parse(query)).toEqual({ok:false,detail});
  });
});

describe('a rep (Appendix B: own data only)',()=>{
  it('is forced to their own quotes whatever they ask for: no other rep, no team, one row',()=>{
    for(const query of ['','reps=eli','reps=eli,nora&teams=Outside%20Sales','reps=ghost&teams=Nights&breakdown=team','breakdown=customer']){
      const q=ok(query,mara);
      expect(q.reps,query).toEqual(['mara']);
      expect(q.teams,query).toEqual([]);
      expect(q.repIds,query).toEqual(['mara']);
      expect(q.cohortRepIds,query).toEqual(['mara']);
      expect(q.breakdown,query).toBe('rep');
    }
  });

  it('keeps the customer (the service drops one the rep cannot read) and the period',()=>{
    expect(ok('customer=canyon-ridge&period=7',mara)).toMatchObject({customerId:'canyon-ridge',window:{from:'2026-10-06T00:00:00.000Z',to:'2026-10-13T00:00:00.000Z'}});
    expect(parse('period=14',mara).ok).toBe(false);
  });
});
