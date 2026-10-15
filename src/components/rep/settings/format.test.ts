import {describe,expect,it} from 'vitest';
import {ACCESS_TYPES,AGING_STATUS,NO_ACCESS_FILTER,accessQuery,accessState,filterCount,firstName,floorInput,floorPosition,inDays,matchCount,parseFloorPct,plainFormula,plusDollars} from './format';

describe('floor field',()=>{
  it('shows a floor at the precision the warnings use',()=>{
    expect(floorInput(0.3)).toBe('30.0');
    expect(floorInput(0.185)).toBe('18.5');
    expect(floorInput(0.19999999999999998)).toBe('20.0');
    expect(floorInput(0)).toBe('0.0');
  });

  it('reads what the rep typed as a percent, to tenths, from 0 to 99.9',()=>{
    expect(parseFloorPct('25')).toBe(25);
    expect(parseFloorPct(' 27.5 ')).toBe(27.5);
    expect(parseFloorPct('27.5%')).toBe(27.5);
    expect(parseFloorPct('22.45')).toBe(22.5);
    expect(parseFloorPct('.5')).toBe(0.5);
    expect(parseFloorPct('0')).toBe(0);
    expect(parseFloorPct('99.9')).toBe(99.9);
    for(const bad of ['','  ','-1','100','99.96','abc','1e2','20,5','.'])expect(parseFloorPct(bad),bad).toBeNull();
  });

  it('places the floor marker on a 0–50% track',()=>{
    expect(floorPosition(0.2)).toBe('40%');
    expect(floorPosition(0.185)).toBe('37%');
    expect(floorPosition(0)).toBe('0%');
    expect(floorPosition(0.8)).toBe('100%');
  });
});

describe('Customer access words and query (plan U8; C_S1, C_S1a, C_S1b)',()=>{
  it("names the data types as the frames do, and each switch's state",()=>{
    expect(ACCESS_TYPES.map(t=>[t.category,t.label])).toEqual([['items_stock','Items and stock'],['pricing','Pricing'],['orders_quotes','Orders and quotes'],['account','Account']]);
    expect([accessState(true),accessState(false),accessState(null)]).toEqual(['Querent answers','Not shared','On for some customers']);
  });

  it('counts the types picked, builds the list query (Any left out) and says how many customers match',()=>{
    expect(filterCount(NO_ACCESS_FILTER)).toBe(0);
    expect(filterCount({...NO_ACCESS_FILTER,pricing:'not_shared',account:'answers'})).toBe(2);
    expect(accessQuery('',NO_ACCESS_FILTER)).toBe('');
    expect(accessQuery('  basin ',{...NO_ACCESS_FILTER,pricing:'not_shared'})).toBe('q=basin&pricing=not_shared');
    expect(accessQuery('',{...NO_ACCESS_FILTER,items_stock:'answers'})).toBe('items_stock=answers');
    expect(matchCount(2,6)).toBe('2 of 6 customers');
    expect(matchCount(0,1)).toBe('0 of 1 customer');
  });
});

describe('other Settings words',()=>{
  it('aging hours as days beside a whole number of days (C_S8 "1 day", "3 days")',()=>{
    expect([inDays('24'),inDays('72'),inDays('168'),inDays('4'),inDays('36'),inDays(''),inDays('abc')]).toEqual(['1 day','3 days','7 days','','','','']);
    expect(AGING_STATUS).toEqual({'Ready for review':'Draft ready','Changes requested':'Changes requested',Sent:'Sent'});
  });

  it('a freight formula with an x, the change in dollars, and a first name',()=>{
    expect(plainFormula('$25.00 + $2.50/mi × 15.0 mi = $62.50')).toBe('$25.00 + $2.50/mi x 15.0 mi = $62.50');
    expect([plusDollars(12),plusDollars(968),plusDollars(0)]).toEqual(['+$0.12','+$9.68','+$0.00']);
    expect(firstName('Eli Porter')).toBe('Eli');
  });
});
