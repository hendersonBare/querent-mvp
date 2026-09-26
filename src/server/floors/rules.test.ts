import {describe,expect,it} from 'vitest';
import {
  DEFAULT_FLOOR,canEditFloor,floorLabel,formatFloor,formatMargin,isBelowFloor,lineFloorStatus,margin,quoteFloorSummary,resolveFloor,roundMargin,
  type FloorLine,type FloorRow,
} from './rules';

// The seeded floors (task 0.2): every rep x category is 20% except Brandi's Abrasives 25%, Safety 30%, Tools 18%.
const CATEGORIES=['fasteners','abrasives','safety','material-handling','tools','janitorial'];
const BRANDI:Record<string,number>={abrasives:0.25,safety:0.3,tools:0.18};
const FLOORS:FloorRow[]=['brandi','mara','eli','nora'].flatMap(rep_id=>CATEGORIES.map(category_id=>({rep_id,category_id,margin_floor:(rep_id==='brandi'?BRANDI[category_id]:undefined)??0.2})));
const brandi={repId:'brandi',repName:'Brandi Gallegos',floors:FLOORS};
const mara={repId:'mara',repName:'Mara Jensen',floors:FLOORS};

// Q-24817 as seeded: bolts on last paid, wheels on contract, gloves on last paid, straps at customer price.
type Line=FloorLine&{id:string};
const BOLTS:Line={id:'l1',unit_price:31.5,unit_cost:21.4,category_id:'fasteners',category_name:'Fasteners'};
const WHEELS:Line={id:'l2',unit_price:36,unit_cost:24.1,category_id:'abrasives',category_name:'Abrasives & Cutting'};
const GLOVES:Line={id:'l3',unit_price:79,unit_cost:58,category_id:'safety',category_name:'Safety & PPE'};
const STRAPS:Line={id:'l4',unit_price:22.95,unit_cost:14.2,category_id:'material-handling',category_name:'Material Handling & Tie-downs'};
const priced=(line:Line,unit_price:number|null):Line=>({...line,unit_price});

describe('margin',()=>{
  it('is (unit price - unit cost) / unit price',()=>{
    expect(margin(25,20)).toBe(0.2);
    expect(margin(79,58)).toBeCloseTo(0.26582,5);
    expect(margin(31.5,21.4)).toBeCloseTo(0.32063,5);
    expect(margin(10,0)).toBe(1);
  });

  it('goes negative when cost is above price',()=>{
    expect(margin(10,12)).toBeCloseTo(-0.2,10);
    expect(margin(0.01,58)).toBeLessThan(-5000);
  });

  it('is null without a usable price: missing, zero, negative or not a number',()=>{
    expect(margin(null,20)).toBeNull();
    expect(margin(undefined,20)).toBeNull();
    expect(margin(0,20)).toBeNull();
    expect(margin(0,0)).toBeNull();
    expect(margin(-5,20)).toBeNull();
    expect(margin(Number.NaN,20)).toBeNull();
    expect(margin(Number.POSITIVE_INFINITY,20)).toBeNull();
  });

  it('is null when the cost is unknown',()=>{
    expect(margin(25,null)).toBeNull();
    expect(margin(25,undefined)).toBeNull();
    expect(margin(25,Number.NaN)).toBeNull();
  });
});

describe('rounding to the portal\'s precision (0.1 percentage point)',()=>{
  it('rounds half up and drops float noise',()=>{
    expect(roundMargin(0.26582278)).toBe(0.266);
    expect(roundMargin(0.19995)).toBe(0.2);
    expect(roundMargin(0.19994)).toBe(0.2);
    expect(roundMargin(0.1994)).toBe(0.199);
    expect(roundMargin(margin(0.35,0.28)!)).toBe(0.2);
  });

  it('formats a margin with one decimal, and no margin as a dash',()=>{
    expect(formatMargin(margin(79,58))).toBe('26.6%');
    expect(formatMargin(0.2)).toBe('20.0%');
    expect(formatMargin(0.19995)).toBe('20.0%');
    expect(formatMargin(1)).toBe('100.0%');
    expect(formatMargin(-0.2)).toBe('-20.0%');
    expect(formatMargin(-0.0004)).toBe('0.0%');
    expect(formatMargin(null)).toBe('—');
  });

  it('formats a floor the way the warning prints it',()=>{
    expect(formatFloor(0.2)).toBe('20%');
    expect(formatFloor(0.3)).toBe('30%');
    expect(formatFloor(0.18)).toBe('18%');
    expect(formatFloor(0.29)).toBe('29%');
    expect(formatFloor(0.185)).toBe('18.5%');
    expect(formatFloor(0)).toBe('0%');
  });
});

describe('isBelowFloor',()=>{
  it('is not below when exactly at the floor',()=>{
    expect(isBelowFloor(0.2,0.2)).toBe(false);
    expect(isBelowFloor(margin(25,20)!,0.2)).toBe(false);
    expect(isBelowFloor(margin(26.75,21.4)!,0.2)).toBe(false);
    expect(isBelowFloor(margin(72.5,58)!,0.2)).toBe(false);
  });

  it('ignores float noise: $0.35 on a $0.28 cost is exactly 20%',()=>{
    expect(margin(0.35,0.28)!<0.2).toBe(true);
    expect(isBelowFloor(margin(0.35,0.28)!,0.2)).toBe(false);
  });

  it('compares at the precision the rep sees: 19.97% shows as 20.0% and is not flagged, 19.94% is',()=>{
    expect(formatMargin(margin(26.74,21.4))).toBe('20.0%');
    expect(isBelowFloor(margin(26.74,21.4)!,0.2)).toBe(false);
    expect(formatMargin(margin(26.73,21.4))).toBe('19.9%');
    expect(isBelowFloor(margin(26.73,21.4)!,0.2)).toBe(true);
    expect(isBelowFloor(0.1995,0.2)).toBe(false);
    expect(isBelowFloor(0.19949,0.2)).toBe(true);
    expect(isBelowFloor(0.1849,0.185)).toBe(false);
    expect(isBelowFloor(0.1844,0.185)).toBe(true);
    expect(isBelowFloor(0.185,0.185)).toBe(false);
  });

  it('flags a negative margin against any floor, and never a margin above it',()=>{
    expect(isBelowFloor(-0.2,0.2)).toBe(true);
    expect(isBelowFloor(-0.01,0)).toBe(true);
    expect(isBelowFloor(0,0)).toBe(false);
    expect(isBelowFloor(0.33,0.25)).toBe(false);
  });
});

describe('resolveFloor: floor[quote rep][line category]',()=>{
  it('uses the rep\'s own floor for the category',()=>{
    expect(resolveFloor(FLOORS,'brandi','safety')).toEqual({floor:0.3,source:'rep'});
    expect(resolveFloor(FLOORS,'brandi','tools')).toEqual({floor:0.18,source:'rep'});
    expect(resolveFloor(FLOORS,'brandi','fasteners')).toEqual({floor:0.2,source:'rep'});
  });

  it('uses another rep\'s floors for their quotes, never Brandi\'s',()=>{
    expect(resolveFloor(FLOORS,'mara','safety')).toEqual({floor:0.2,source:'rep'});
    expect(resolveFloor([...FLOORS,{rep_id:'eli',category_id:'widgets',margin_floor:0.4}],'eli','widgets')).toEqual({floor:0.4,source:'rep'});
    expect(resolveFloor([{rep_id:'brandi',category_id:'widgets',margin_floor:0.4}],'eli','widgets')).toEqual({floor:DEFAULT_FLOOR,source:'default'});
  });

  it('falls back to 20% when the pair has no floor row',()=>{
    expect(DEFAULT_FLOOR).toBe(0.2);
    expect(resolveFloor(FLOORS,'brandi','widgets')).toEqual({floor:0.2,source:'default'});
    expect(resolveFloor(FLOORS,'nobody','safety')).toEqual({floor:0.2,source:'default'});
    expect(resolveFloor([],'brandi','safety')).toEqual({floor:0.2,source:'default'});
  });

  it('falls back to 20% when a stored floor is unusable, but keeps a 0% floor',()=>{
    for(const bad of [Number.NaN,1,1.5,-0.1])expect(resolveFloor([{rep_id:'brandi',category_id:'safety',margin_floor:bad}],'brandi','safety')).toEqual({floor:0.2,source:'default'});
    expect(resolveFloor([{rep_id:'brandi',category_id:'safety',margin_floor:0}],'brandi','safety')).toEqual({floor:0,source:'rep'});
  });
});

describe('floorLabel',()=>{
  it('names whose floor, the floor and the category (spec §4 wording)',()=>{
    expect(floorLabel('Brandi Gallegos',0.2,'Fasteners')).toBe('Below Brandi\'s 20% Fasteners floor');
    expect(floorLabel('Brandi Gallegos',0.3,'Safety & PPE')).toBe('Below Brandi\'s 30% Safety & PPE floor');
    expect(floorLabel('Mara Jensen',0.185,'Tools')).toBe('Below Mara\'s 18.5% Tools floor');
    expect(floorLabel('  Nora  ',0.2,'Janitorial/MRO')).toBe('Below Nora\'s 20% Janitorial/MRO floor');
    expect(floorLabel(' ',0.2,'Tools')).toBe('Below the rep\'s 20% Tools floor');
  });
});

describe('lineFloorStatus',()=>{
  it('flags the seeded gloves line under Brandi\'s 30% Safety & PPE floor',()=>{
    const status=lineFloorStatus(GLOVES,brandi);
    expect(status).toEqual({margin:expect.closeTo(0.2658,4),floor:0.3,floorPct:30,floorSource:'rep',belowFloor:true,label:'Below Brandi\'s 30% Safety & PPE floor'});
  });

  it('leaves lines at or above their floor alone',()=>{
    expect(lineFloorStatus(BOLTS,brandi)).toMatchObject({floor:0.2,floorPct:20,belowFloor:false,label:null});
    expect(lineFloorStatus(WHEELS,brandi)).toMatchObject({floor:0.25,floorPct:25,belowFloor:false,label:null});
    expect(lineFloorStatus(priced(BOLTS,26.75),brandi)).toMatchObject({margin:expect.closeTo(0.2,10),belowFloor:false,label:null});
  });

  it('uses the quote rep\'s floor: the same gloves line is fine against Mara\'s 20%',()=>{
    expect(lineFloorStatus(GLOVES,mara)).toMatchObject({floor:0.2,belowFloor:false,label:null});
    expect(lineFloorStatus(priced(GLOVES,70),mara)).toMatchObject({belowFloor:true,label:'Below Mara\'s 20% Safety & PPE floor'});
  });

  it('flags cost above price with a negative margin',()=>{
    const status=lineFloorStatus(priced(GLOVES,50),brandi);
    expect(status.margin).toBeCloseTo(-0.16,10);
    expect(status).toMatchObject({belowFloor:true,label:'Below Brandi\'s 30% Safety & PPE floor'});
  });

  it('always flags a price of $0 or less, which has no margin',()=>{
    expect(lineFloorStatus(priced(BOLTS,0),brandi)).toEqual({margin:null,floor:0.2,floorPct:20,floorSource:'rep',belowFloor:true,label:'Below Brandi\'s 20% Fasteners floor'});
    expect(lineFloorStatus(priced(BOLTS,-1),brandi)).toMatchObject({margin:null,belowFloor:true});
    expect(lineFloorStatus({...priced(BOLTS,0),unit_cost:0},brandi)).toMatchObject({belowFloor:true});
  });

  it('does not warn on a line with no price yet',()=>{
    expect(lineFloorStatus(priced(BOLTS,null),brandi)).toEqual({margin:null,floor:0.2,floorPct:20,floorSource:'rep',belowFloor:false,label:null});
    expect(lineFloorStatus(priced(BOLTS,Number.NaN),brandi)).toMatchObject({margin:null,belowFloor:false,label:null});
    expect(lineFloorStatus({...BOLTS,unit_cost:Number.NaN},brandi)).toMatchObject({margin:null,belowFloor:false,label:null});
  });

  it('falls back to 20% for a category with no floor row, and still names it',()=>{
    const widget={unit_price:11,unit_cost:9,category_id:'widgets',category_name:'Widgets'};
    expect(lineFloorStatus(widget,brandi)).toEqual({margin:expect.closeTo(0.1818,4),floor:0.2,floorPct:20,floorSource:'default',belowFloor:true,label:'Below Brandi\'s 20% Widgets floor'});
    expect(lineFloorStatus({...widget,unit_price:11.25},brandi)).toMatchObject({floorSource:'default',belowFloor:false,label:null});
    expect(lineFloorStatus(GLOVES,{repId:'nobody',repName:'New Rep',floors:FLOORS})).toMatchObject({floor:0.2,floorSource:'default',belowFloor:false});
  });

  it('respects a rep\'s fractional floor at the boundary',()=>{
    const tools={unit_price:100,unit_cost:81.5,category_id:'tools',category_name:'Tools'};
    const floors:FloorRow[]=[{rep_id:'brandi',category_id:'tools',margin_floor:0.185}];
    expect(lineFloorStatus(tools,{...brandi,floors})).toMatchObject({floorPct:18.5,belowFloor:false});
    expect(lineFloorStatus({...tools,unit_price:99.9},{...brandi,floors})).toMatchObject({belowFloor:true,label:'Below Brandi\'s 18.5% Tools floor'});
  });
});

describe('quoteFloorSummary',()=>{
  const q24817={rep_id:'brandi',rep_name:'Brandi Gallegos',lines:[BOLTS,WHEELS,GLOVES,STRAPS]};

  it('gives every line its status, in order, and counts the lines below floor',()=>{
    const summary=quoteFloorSummary(q24817,FLOORS);
    expect(summary.rep_id).toBe('brandi');
    expect(summary.belowFloorCount).toBe(1);
    expect(summary.lines.map(l=>[l.line_id,l.floorPct,l.belowFloor])).toEqual([['l1',20,false],['l2',25,false],['l3',30,true],['l4',20,false]]);
    expect(summary.lines[2].label).toBe('Below Brandi\'s 30% Safety & PPE floor');
  });

  it('resolves against the quote\'s rep',()=>{
    expect(quoteFloorSummary({...q24817,rep_id:'mara',rep_name:'Mara Jensen'},FLOORS).belowFloorCount).toBe(0);
  });

  it('counts $0 lines but not unpriced ones',()=>{
    const summary=quoteFloorSummary({...q24817,lines:[priced(BOLTS,null),priced(WHEELS,0),priced(GLOVES,50),STRAPS]},FLOORS);
    expect(summary.lines.map(l=>l.belowFloor)).toEqual([false,true,true,false]);
    expect(summary.belowFloorCount).toBe(2);
  });

  it('handles a quote with no lines',()=>{
    expect(quoteFloorSummary({...q24817,lines:[]},FLOORS)).toEqual({rep_id:'brandi',rep_name:'Brandi Gallegos',lines:[],belowFloorCount:0});
  });
});

describe('canEditFloor: each rep edits only their own floors',()=>{
  it('allows the rep\'s own floors only',()=>{
    expect(canEditFloor('brandi','brandi')).toBe(true);
    expect(canEditFloor('brandi','mara')).toBe(false);
    expect(canEditFloor('mara','brandi')).toBe(false);
  });

  it('rejects anyone who is not a rep',()=>{
    expect(canEditFloor(null,'brandi')).toBe(false);
    expect(canEditFloor(undefined,'brandi')).toBe(false);
    expect(canEditFloor('','')).toBe(false);
  });
});
