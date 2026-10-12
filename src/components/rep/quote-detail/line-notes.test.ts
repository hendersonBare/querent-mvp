import {describe,expect,it} from 'vitest';
import {lineNotes} from './line-notes';
import {FLOORS,ITEMS,SAMPLE_LINES,detailLine} from './test-fixtures';

// The inline notes on a line (decision 44; plan U4): the checks box is gone, so stock short at the
// quote branch and a SKU match below the confident score (0.75) show on their line, like the
// below-floor note.

const floor={repId:'brandi',repName:'Brandi Gallegos',floors:FLOORS};

describe('lineNotes',()=>{
  it('a line in stock with a confident match has none',()=>{
    expect(lineNotes(SAMPLE_LINES[0],floor)).toEqual([]);
  });

  it('stock short at the quote branch: how short, the other branches and what is on order',()=>{
    expect(lineNotes(SAMPLE_LINES[3],floor)).toEqual([{kind:'stock',text:'Short 5 at SLC. 20 at Ogden. 24 on order at SLC, due Sep 26'}]);
  });

  it('a match below 0.75 asks the rep to confirm it, with the customer\'s words',()=>{
    const unsure=detailLine(ITEMS.bolts,{n:1,qty:10,unit_price:31.5,price_basis:'last_paid',requested_text:'half inch bolts',match_score:0.74});
    expect(lineNotes(unsure,floor)).toEqual([{kind:'match',text:'Confirm the match for "half inch bolts"'}]);
    const sure=detailLine(ITEMS.bolts,{n:1,qty:10,unit_price:31.5,price_basis:'last_paid',requested_text:'half inch bolts',match_score:0.75});
    expect(lineNotes(sure,floor)).toEqual([]);
  });

  it('a low match with no words names the SKU; a line with no score (added by the rep) has no match note',()=>{
    expect(lineNotes(detailLine(ITEMS.bolts,{n:1,qty:10,unit_price:31.5,price_basis:'last_paid',match_score:0.5}),floor))
      .toEqual([{kind:'match',text:'Confirm the match for "HCS-12-13-2G8"'}]);
    expect(lineNotes(detailLine(ITEMS.bolts,{n:1,qty:10,unit_price:31.5,price_basis:'last_paid',match_score:null}),floor)).toEqual([]);
  });

  it('both, stock first',()=>{
    const both=detailLine(ITEMS.straps,{n:4,qty:12,unit_price:22.95,price_basis:'customer',requested_text:'straps',match_score:0.6});
    expect(lineNotes(both,floor).map(n=>n.kind)).toEqual(['stock','match']);
  });
});
