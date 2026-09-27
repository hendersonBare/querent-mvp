import {describe,expect,it} from 'vitest';
import {quantityOf,splitRequest,withoutQty} from './lines';

const lines=(text:string)=>splitRequest(text).map(l=>[l.text,l.qty]);

describe('splitRequest',()=>{
  it('splits Dana\'s request into one line per item, each without its qty',()=>{
    expect(splitRequest('Please quote 10 boxes of the 1/2 in grade 8 hex bolts and 6 boxes of cut-off wheels. We\'ll pick up at SLC.')).toEqual([
      {said:'10 boxes of the 1/2 in grade 8 hex bolts',text:'the 1/2 in grade 8 hex bolts',qty:10},
      {said:'6 boxes of cut-off wheels',text:'cut-off wheels',qty:6},
      {said:'We\'ll pick up at SLC',text:'We\'ll pick up at SLC',qty:null},
    ]);
  });

  it('labels each line in the customer\'s words without the request words in front (2.2 follow-up)',()=>{
    const said=(text:string)=>splitRequest(text).map(l=>l.said);
    expect(said('Please quote 2 boxes of hex bolts')).toEqual(['2 boxes of hex bolts']);
    expect(said('Can you send us 12 ratchet straps and 6 boxes of cut-off wheels')).toEqual(['12 ratchet straps','6 boxes of cut-off wheels']);
    expect(said('Please quote the cut-off wheels')).toEqual(['the cut-off wheels']);
    expect(said("We'd like to order nitrile gloves, large")).toEqual(['nitrile gloves, large']);
    expect(said('I need 4 cases of gloves')).toEqual(['4 cases of gloves']);
    // Item words are never taken: "quote" or "send" later in the line stays.
    expect(said('hex bolts, quote 10 boxes')).toEqual(['hex bolts, quote 10 boxes']);
  });

  it('splits at line breaks, semicolons and bullets whatever follows',()=>{
    expect(lines('- 4 cases nitrile gloves, large\n- safety glasses; 12 ratchet straps 2 in x 27 ft')).toEqual([
      ['nitrile gloves, large',4],['safety glasses',null],['ratchet straps 2 in x 27 ft',12],
    ]);
    expect(lines('1. hex nuts 1/2-13\n2. flat washers 1/2')).toEqual([['hex nuts 1/2-13',null],['flat washers 1/2',null]]);
  });

  it('splits at a comma, "and", "plus" or "&" only when a count follows',()=>{
    expect(lines('1/2-13 grade 8 hex nuts and washers')).toEqual([['1/2-13 grade 8 hex nuts and washers',null]]);
    expect(lines('flap discs, 40 grit, 4.5 in')).toEqual([['flap discs, 40 grit, 4.5 in',null]]);
    expect(lines('3 boxes of Type 27 wheels, 2 boxes flap discs plus 5 rolls duct tape & 1 case of gloves')).toEqual([
      ['Type 27 wheels',3],['flap discs',2],['duct tape',5],['gloves',1],
    ]);
  });

  it('keeps a trailing count with its item',()=>{
    expect(lines('hex bolts, 10 boxes; cut-off wheels, qty 6')).toEqual([['hex bolts',10],['cut-off wheels',6]]);
  });

  it('never mistakes a size or a decimal for a count or a sentence end',()=>{
    expect(lines('2 in hex bolts')).toEqual([['2 in hex bolts',null]]);
    expect(lines('30 ft ratchet straps')).toEqual([['30 ft ratchet straps',null]]);
    expect(lines('4.5 x .045 cut-off wheels')).toEqual([['4.5 x .045 cut-off wheels',null]]);
    expect(lines('1/2 in. grade 8 hex bolts')).toEqual([['1/2 in. grade 8 hex bolts',null]]);
    expect(lines('6 1/2-13 hex nuts')).toEqual([['6 1/2-13 hex nuts',null]]);
  });

  it('drops pieces with no item words, and returns nothing for an empty request',()=>{
    expect(lines('10 boxes')).toEqual([]);
    expect(lines('  ')).toEqual([]);
    expect(lines('Need 6 cut-off wheels!')).toEqual([['cut-off wheels',6]]);
  });
});

describe('quantityOf and withoutQty',()=>{
  it.each([
    ['10 boxes of the 1/2 in grade 8 hex bolts',10,'the 1/2 in grade 8 hex bolts'],
    ['Can you send 12 of the 1/2 in grade 8 hex bolts to Provo',12,'the 1/2 in grade 8 hex bolts to Provo'],
    ['Need 4 boxes of Type 27 cut-off wheels',4,'Type 27 cut-off wheels'],
    ['I want the 1/2 in grade 8 hex bolts',null,'I want the 1/2 in grade 8 hex bolts'],
    ['quantity: 8 flap discs',8,'flap discs'],
    ['2 Type 27 wheels',2,'Type 27 wheels'],
    ['27 ft ratchet straps',null,'27 ft ratchet straps'],
    ['0 boxes of gloves',null,'gloves'],
  ])('"%s" -> qty %s, scored as "%s"',(line,qty,text)=>{
    expect(quantityOf(line)).toBe(qty);
    expect(withoutQty(line)).toBe(text);
  });
});
