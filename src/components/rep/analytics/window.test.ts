import {describe,expect,it} from 'vitest';
import {MAX_CUSTOM_DAYS,analyticsQuery,customWindow,dayInput,drillHref,metricsQuery,presetWindow,windowLabel} from './window';

// The Team dashboard's date window and links (v3 spec §6 Team, §7; decisions 10, 23; OA-19; task
// D3). The browser buckets days in its own time zone: a window runs from local midnight to local
// midnight, sent as two ISO instants.

const localMidnight=(y:number,m:number,d:number)=>new Date(y,m-1,d).toISOString();

describe('presetWindow',()=>{
  it('the last N days: from local midnight N-1 days ago to local midnight tonight (today included)',()=>{
    const now=new Date(2026,9,10,15,30);
    expect(presetWindow(7,now)).toEqual({from:localMidnight(2026,10,4),to:localMidnight(2026,10,11)});
    expect(presetWindow(30,now)).toEqual({from:localMidnight(2026,9,11),to:localMidnight(2026,10,11)});
    expect(presetWindow(90,now)).toEqual({from:localMidnight(2026,7,13),to:localMidnight(2026,10,11)});
  });
  it('just after midnight still counts today',()=>{
    expect(presetWindow(7,new Date(2026,9,10,0,0,1))).toEqual({from:localMidnight(2026,10,4),to:localMidnight(2026,10,11)});
  });
});

describe('customWindow',()=>{
  it('both days included: local midnight of the first to local midnight after the last',()=>{
    expect(customWindow('2026-09-01','2026-09-30')).toEqual({ok:true,window:{from:localMidnight(2026,9,1),to:localMidnight(2026,10,1)}});
    expect(customWindow('2026-10-10','2026-10-10')).toEqual({ok:true,window:{from:localMidnight(2026,10,10),to:localMidnight(2026,10,11)}});
  });
  it('explains a missing, reversed or too long range',()=>{
    expect(customWindow('','2026-09-30')).toEqual({ok:false,problem:'Pick a start and an end date.'});
    expect(customWindow('2026-09-30','2026-09-01')).toEqual({ok:false,problem:'The end date must be on or after the start date.'});
    expect(customWindow('2025-01-01','2026-09-30')).toEqual({ok:false,problem:`Pick at most ${MAX_CUSTOM_DAYS} days.`});
  });
  it('formats a local day for a date input',()=>{
    expect(dayInput(new Date(2026,0,5,23,59))).toBe('2026-01-05');
  });
});

describe('links',()=>{
  const window={from:'2026-09-11T06:00:00.000Z',to:'2026-10-11T06:00:00.000Z'};
  it('builds the metrics query with the ticked reps and the team label',()=>{
    expect(metricsQuery(window,['mara','eli'],'Inside Sales')).toBe('from=2026-09-11T06%3A00%3A00.000Z&to=2026-10-11T06%3A00%3A00.000Z&reps=mara%2Celi&team=Inside+Sales');
    expect(metricsQuery(window,['mara'],null)).toBe('from=2026-09-11T06%3A00%3A00.000Z&to=2026-10-11T06%3A00%3A00.000Z&reps=mara');
  });
  it('drills into the manager’s Quotes list (no ?scope=all) for one rep or a group, a status or an aging level',()=>{
    expect(drillHref(window,['mara'])).toBe('/rep/quotes?rep=mara&from=2026-09-11T06%3A00%3A00.000Z&to=2026-10-11T06%3A00%3A00.000Z');
    expect(drillHref(window,['mara','eli'],{status:'declined'})).toBe('/rep/quotes?rep=mara%2Celi&from=2026-09-11T06%3A00%3A00.000Z&to=2026-10-11T06%3A00%3A00.000Z&status=declined');
    expect(drillHref(window,['eli'],{aging:'red'})).toBe('/rep/quotes?rep=eli&from=2026-09-11T06%3A00%3A00.000Z&to=2026-10-11T06%3A00%3A00.000Z&aging=red');
  });
});

// Analytics (plan U6): the page's filter as GET /api/rep/analytics reads it, the leaderboard's window
// line (C_AN6 "Quotes created Sep 12, 2026 to Oct 11, 2026, ..."), and a customer row's drill-down.
describe('analyticsQuery',()=>{
  const window={from:'2026-09-12T06:00:00.000Z',to:'2026-10-12T06:00:00.000Z'};
  it('sends only what is picked: the window always, reps, teams, the customer and a breakdown other than the whole organization',()=>{
    expect(analyticsQuery({reps:[],teams:[],customer:null,breakdown:'org'},window)).toBe('from=2026-09-12T06%3A00%3A00.000Z&to=2026-10-12T06%3A00%3A00.000Z');
    const params=new URLSearchParams(analyticsQuery({reps:['eli','mara'],teams:['Inside Sales'],customer:'wasatch',breakdown:'team'},window));
    expect(Object.fromEntries(params)).toEqual({from:window.from,to:window.to,reps:'eli,mara',teams:'Inside Sales',customer:'wasatch',breakdown:'team'});
  });
});

describe('windowLabel',()=>{
  it('names the first and last local day of the window, both included',()=>{
    expect(windowLabel({from:new Date(2026,8,12).toISOString(),to:new Date(2026,9,12).toISOString()})).toBe('Sep 12, 2026 to Oct 11, 2026');
    expect(windowLabel(presetWindow(7,new Date(2026,9,11,9)))).toBe('Oct 5, 2026 to Oct 11, 2026');
  });
});

describe('drillHref for a customer row',()=>{
  it('narrows the Quotes list to the customer as well',()=>{
    const href=drillHref({from:'a',to:'b'},['mara','eli'],{status:'declined',customer:'wasatch'});
    expect(Object.fromEntries(new URL(href,'http://x').searchParams)).toEqual({rep:'mara,eli',from:'a',to:'b',status:'declined',customer:'wasatch'});
  });
});
