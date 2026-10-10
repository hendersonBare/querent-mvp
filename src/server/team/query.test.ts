import {describe,expect,it} from 'vitest';
import {MAX_RANGE_DAYS,parseTeamQuery} from './query';

// The Team dashboard's filters as the API reads them (v3 spec §5, §7; decision 23; OA-19; task D3):
// two ISO instants the browser computed at its local midnight, the reps ticked, and a team label.

const REPS=[
  {id:'brandi',name:'Brandi Gallegos',team:'Inside Sales',active:true},
  {id:'eli',name:'Eli Porter',team:'Outside Sales',active:true},
  {id:'mara',name:'Mara Jensen',team:'Inside Sales',active:true},
  {id:'nora',name:'Nora Chen',team:'Outside Sales',active:false},
];
const FROM='2026-09-30T06:00:00.000Z',TO='2026-10-10T06:00:00.000Z';
const parse=(params:Record<string,string>)=>parseTeamQuery(new URLSearchParams(params),REPS);

describe('parseTeamQuery',()=>{
  it('takes the window as given (normalised to UTC) and defaults to every active rep',()=>{
    expect(parse({from:FROM,to:TO})).toEqual({ok:true,query:{from:FROM,to:TO,repIds:['brandi','eli','mara'],team:null}});
    expect(parse({from:'2026-09-30T00:00:00-06:00',to:'2026-10-10T00:00-06:00'})).toMatchObject({ok:true,query:{from:FROM,to:TO}});
  });

  it('keeps the ticked reps in rep order, inactive ones too (Team history), without duplicates',()=>{
    expect(parse({from:FROM,to:TO,reps:'mara,nora,eli,mara'})).toMatchObject({ok:true,query:{repIds:['eli','mara','nora']}});
  });

  it('narrows the reps to a team label',()=>{
    expect(parse({from:FROM,to:TO,team:'Inside Sales'})).toMatchObject({ok:true,query:{repIds:['brandi','mara'],team:'Inside Sales'}});
    expect(parse({from:FROM,to:TO,team:'Outside Sales',reps:'mara,nora'})).toMatchObject({ok:true,query:{repIds:['nora'],team:'Outside Sales'}});
  });

  it('refuses a missing or malformed window, an empty or reversed one, and one over the maximum range',()=>{
    expect(parse({to:TO})).toEqual({ok:false,detail:'Choose a date range: from and to are ISO date-times.'});
    expect(parse({from:'2026-09-30',to:TO})).toMatchObject({ok:false});
    expect(parse({from:'yesterday',to:TO})).toMatchObject({ok:false});
    expect(parse({from:'2026-02-30T00:00:00Z',to:TO})).toMatchObject({ok:false});
    expect(parse({from:TO,to:TO})).toEqual({ok:false,detail:'The range must end after it starts.'});
    expect(parse({from:TO,to:FROM})).toMatchObject({ok:false});
    const start=Date.parse(FROM);
    expect(parse({from:FROM,to:new Date(start+MAX_RANGE_DAYS*86_400_000).toISOString()})).toMatchObject({ok:true});
    expect(parse({from:FROM,to:new Date(start+MAX_RANGE_DAYS*86_400_000+1).toISOString()})).toEqual({ok:false,detail:`Pick a range of at most ${MAX_RANGE_DAYS} days.`});
  });

  it('refuses an unknown rep or team label',()=>{
    expect(parse({from:FROM,to:TO,reps:'mara,ghost'})).toEqual({ok:false,detail:'Unknown rep: ghost.'});
    expect(parse({from:FROM,to:TO,team:'Night Shift'})).toEqual({ok:false,detail:'Unknown team: Night Shift.'});
  });
});
