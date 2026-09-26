import {describe,expect,it} from 'vitest';
import {createQuote,quote,repFloors} from '@/server/repository';
import {useSeededDatabase} from '@/server/repository/test-db';
import {DEFAULT_FLOOR} from './rules';
import {FloorPermissionError,effectiveFloor,quoteFloors,setMyFloor} from './service';

useSeededDatabase();

describe('quoteFloors (seeded data)',()=>{
  it('flags only the gloves line on Q-24817, under Brandi\'s 30% Safety & PPE floor',()=>{
    const summary=quoteFloors('q-24817')!;
    expect(summary).toMatchObject({rep_id:'brandi',rep_name:'Brandi Gallegos',belowFloorCount:1});
    expect(summary.lines.map(l=>[l.line_id,l.floorPct,l.floorSource,l.belowFloor])).toEqual([
      ['q-24817-1',20,'rep',false],['q-24817-2',25,'rep',false],['q-24817-3',30,'rep',true],['q-24817-4',20,'rep',false],
    ]);
    expect(summary.lines[2]).toMatchObject({margin:expect.closeTo(0.2658,4),label:'Below Brandi\'s 30% Safety & PPE floor'});
  });

  it('accepts a quote already loaded, and returns undefined for an unknown quote',()=>{
    expect(quoteFloors(quote('q-24817')!)).toEqual(quoteFloors('q-24817'));
    expect(quoteFloors('q-nope')).toBeUndefined();
  });

  it('uses the customer\'s assigned rep\'s floors: Canyon Ridge quotes use Mara\'s',()=>{
    const q=createQuote({customerId:'canyon-ridge',fulfillment:'will_call',branchId:'slc',at:'2026-09-23T17:00:00.000Z',
      lines:[{itemId:'GLV-N8-L-1000',qty:4,unitPrice:79},{itemId:'GLV-N8-L-1000',qty:4,unitPrice:70},{itemId:'HCS-12-13-2G8',qty:10,unitPrice:null}]});
    expect(q.rep_id).toBe('mara');
    const summary=quoteFloors(q.id)!;
    expect(summary.lines.map(l=>[l.floorPct,l.belowFloor,l.label])).toEqual([[20,false,null],[20,true,'Below Mara\'s 20% Safety & PPE floor'],[20,false,null]]);
    expect(summary.belowFloorCount).toBe(1);
  });
});

describe('effectiveFloor',()=>{
  it('resolves floor[rep][category] from the database',()=>{
    expect(effectiveFloor('brandi','safety')).toEqual({floor:0.3,source:'rep'});
    expect(effectiveFloor('brandi','tools')).toEqual({floor:0.18,source:'rep'});
    expect(effectiveFloor('eli','safety')).toEqual({floor:0.2,source:'rep'});
  });

  it('falls back to 20% for a category or rep with no floor row',()=>{
    expect(effectiveFloor('brandi','widgets')).toEqual({floor:DEFAULT_FLOOR,source:'default'});
    expect(effectiveFloor('nobody','fasteners')).toEqual({floor:DEFAULT_FLOOR,source:'default'});
  });

  it('matches the seed: every floor other than Brandi\'s few is the default',()=>{
    for(const rep of ['mara','eli','nora'])expect(repFloors(rep).map(f=>f.margin_floor)).toEqual(Array(6).fill(DEFAULT_FLOOR));
  });
});

describe('setMyFloor: each rep edits only their own floors',()=>{
  it('rejects editing another rep\'s floor, and writes nothing',()=>{
    expect(()=>setMyFloor('brandi','mara','fasteners',0.5)).toThrow(FloorPermissionError);
    expect(()=>setMyFloor('mara','brandi','safety',0.1)).toThrow('Reps can only change their own margin floors.');
    expect(effectiveFloor('mara','fasteners')).toEqual({floor:0.2,source:'rep'});
    expect(effectiveFloor('brandi','safety')).toEqual({floor:0.3,source:'rep'});
  });

  it('rejects anyone who is not a rep (the customer persona has no rep id)',()=>{
    expect(()=>setMyFloor(null,'brandi','safety',0.1)).toThrow(FloorPermissionError);
    expect(()=>setMyFloor(undefined,'brandi','safety',0.1)).toThrow(FloorPermissionError);
    expect(effectiveFloor('brandi','safety').floor).toBe(0.3);
  });

  it('rejects a floor outside 0 to under 100%, and ignores an unknown category',()=>{
    expect(()=>setMyFloor('brandi','brandi','safety',1)).toThrow(RangeError);
    expect(()=>setMyFloor('brandi','brandi','safety',-0.05)).toThrow(RangeError);
    expect(setMyFloor('brandi','brandi','widgets',0.2)).toBeUndefined();
    expect(effectiveFloor('brandi','safety').floor).toBe(0.3);
  });

  it('updates the rep\'s own floor, and the warning follows it',()=>{
    expect(setMyFloor('brandi','brandi','safety',0.25,'2026-09-26T18:00:00.000Z')).toEqual({rep_id:'brandi',category_id:'safety',category_name:'Safety & PPE',margin_floor:0.25,updated_at:'2026-09-26T18:00:00.000Z'});
    expect(quoteFloors('q-24817')!.belowFloorCount).toBe(0);
    setMyFloor('brandi','brandi','fasteners',0.35);
    expect(quoteFloors('q-24817')!.lines.filter(l=>l.belowFloor).map(l=>l.label)).toEqual(['Below Brandi\'s 35% Fasteners floor']);
    expect(effectiveFloor('mara','fasteners').floor).toBe(0.2);
  });
});
