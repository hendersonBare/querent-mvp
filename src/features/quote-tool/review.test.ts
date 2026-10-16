import {describe,expect,it} from 'vitest';
import {
  blockersMessage,editQuantity,quantityChecks,quantityChecksMessage,formatMoney,lineHint,quantityAside,quantityFlag,reasonHint,initialReview,lineCents,listPriceLabel,parsePrice,parseQuantity,saveBlockers,toSaveRequest,totalCents,withItem,
  type ReviewLine,
} from './review';
import {sampleRun} from './test-fixtures';
import type {ScoredItem} from './types';
import {pricingUnit} from './units';

// The review dialog's state rules, without the DOM: prices and quantities as typed, line totals in
// cents, why Save is blocked, and the body Save posts.

describe('parsePrice',()=>{
  it.each([['0.79',0.79],['$1,250.5',1250.5],[' 12 ',12],['0',0],['.5',0.5],['3.1234',3.1234]])('reads %j',(input,value)=>expect(parsePrice(input)).toBe(value));
  it.each(['','  ','-1','1.23456','abc','1.2.3','$','1e3'])('refuses %j',input=>expect(parsePrice(input)).toBeNull());
});

describe('parseQuantity',()=>{
  it.each([['10',10],['2.5',2.5],['1,000',1000],['0.125',0.125]])('reads %j',(input,value)=>expect(parseQuantity(input)).toBe(value));
  it.each(['','0','-2','1.0005','ten','0.000'])('refuses %j',input=>expect(parseQuantity(input)).toBeNull());
});

describe('money',()=>{
  it('rounds each line total to the cent, as the database does',()=>{
    expect(lineCents(10,0.79)).toBe(790);
    expect(lineCents(3,0.335)).toBe(101);
    expect(lineCents(7,1.1235)).toBe(786);
    expect(lineCents(0.1,0.3)).toBe(3);
  });
  it('formats dollars',()=>{
    expect(formatMoney(812345)).toBe('$8,123.45');
    expect(formatMoney(0)).toBe('$0.00');
  });
  it('labels the web list price per its pack unit, never as a price to use',()=>{
    expect(listPriceLabel({listPrice:0.84,listPriceUnit:'each'})).toBe('Web list: $0.84/each');
    expect(listPriceLabel({listPrice:81.08,listPriceUnit:'case'})).toBe('Web list: $81.08/case');
    expect(listPriceLabel({listPrice:5,listPriceUnit:null})).toBe('Web list: $5.00');
    expect(listPriceLabel({listPrice:null,listPriceUnit:'each'})).toBeNull();
  });
});

describe('reasonHint',()=>{
  it('gives a short hint for each known No-match reason, including ones the matcher adds later',()=>{
    for(const reason of ['below_threshold','low_lead','no_product_type','not_accounted','judge_none','judge_disagrees','judge_error','no_candidates'])
      expect(reasonHint(reason),reason).toMatch(/^[A-Z].*\.$/);
  });
  it('gives no hint for a matched line or a reason it does not know',()=>{
    expect(reasonHint('matched')).toBeNull();
    expect(reasonHint('something_new')).toBeNull();
    expect(reasonHint('toString')).toBeNull();
  });
});

describe('lineHint',()=>{
  it('names the matcher\'s blockers in words when the line was not accountable at Strict',()=>{
    expect(lineHint('not_accounted',['two sizes: 12x10x8 and 4x4'])).toBe('Not matched automatically: the line names two sizes: 12x10x8 and 4x4.');
    expect(lineHint('not_accounted',['the line says "or"','"/" in the line','a range'])).toBe('Not matched automatically: the line says "or"; "/" in the line.');
    expect(lineHint('no_product_type',['the line names no product (box, bag, mailer, tape, ...)'])).toBe('Not matched automatically: the line names no product (box, bag, mailer, tape, ...).');
    expect(lineHint('not_accounted',['contradicts: size: 12x8x10 in vs 12x10x8 in'])).toBe('Not matched automatically: the closest item differs in size: 12x8x10 in vs 12x10x8 in.');
  });
  it('falls back to the reason\'s hint without blockers, or for reasons the blockers do not explain',()=>{
    expect(lineHint('not_accounted',[])).toBe(reasonHint('not_accounted'));
    expect(lineHint('low_lead',['the line says "or"'])).toBe(reasonHint('low_lead'));
    expect(lineHint('judge_none',['a range'])).toBe(reasonHint('judge_none'));
    expect(lineHint('a_new_reason',[])).toBeNull();
  });
  it('keeps a long hint short',()=>{
    expect(lineHint('not_accounted',['x'.repeat(400)])!.length).toBeLessThanOrEqual(160);
  });
});

describe('the review state',()=>{
  it('starts with matched lines unpriced, quantities in each item\'s pricing unit (blank when unclear), unmatched lines as the customer wrote them',()=>{
    const lines=initialReview(sampleRun());
    expect(lines.map(l=>[l.status,l.price,l.quantity,l.unit,l.matchedBy])).toEqual([
      ['matched','','250','each','auto'],['matched','','','case','auto'],['unmatched','','4','case',null],['unmatched','','2','bag',null],
    ]);
    // The customer's own quantity and unit stay on the line, for Swap and "Use this item".
    expect(lines.map(l=>[l.customerQuantity,l.customerUnit])).toEqual([[10,'bundle'],[null,null],[4,'case'],[2,'bag']]);
    expect(lines[0].quantityNote).toEqual({kind:'converted',wrote:'10 bundles',text:'Customer asked for 10 bundles = 250 each'});
    expect(lines.slice(1).map(l=>l.quantityNote)).toEqual([null,null,null]);
  });

  it('blocks Save until every matched line has a price and a quantity, and says why',()=>{
    let lines=initialReview(sampleRun());
    expect(saveBlockers(lines)).toEqual({missingPrice:2,badQuantity:1,empty:false});
    expect(blockersMessage(saveBlockers(lines))).toBe('Add a price to 2 lines and a quantity to 1 line.');
    lines=lines.map((l,i)=>i===0?{...l,price:'0.79'}:l);
    expect(blockersMessage(saveBlockers(lines))).toBe('Add a price to 1 line and a quantity to 1 line.');
    lines=lines.map((l,i)=>i===1?{...l,price:'24.5',quantity:'3'}:l);
    expect(saveBlockers(lines)).toEqual({missingPrice:0,badQuantity:0,empty:false});
    expect(blockersMessage(saveBlockers(lines))).toBeNull();
  });

  it('does not count removed lines, and needs at least one line to save',()=>{
    const lines=initialReview(sampleRun()).map(l=>({...l,status:'removed' as const}));
    expect(saveBlockers(lines)).toEqual({missingPrice:0,badQuantity:0,empty:true});
    expect(blockersMessage(saveBlockers(lines))).toBe('There is nothing to save.');
  });

  it('totals the priced matched lines only',()=>{
    const lines:ReviewLine[]=initialReview(sampleRun()).map((l,i)=>i===0?{...l,price:'0.79'}:i===1?{...l,price:'24.5',quantity:'3'}:l);
    // 250 each x $0.79 per each, and 3 cases x $24.50 per case.
    expect(totalCents(lines)).toBe(19750+7350);
    expect(totalCents(lines.map((l,i)=>i===1?{...l,status:'removed' as const}:l))).toBe(19750);
  });

  it('builds the save body: matched lines by SKU with who matched them, unmatched lines with near-miss SKUs and scores, removed lines left out',()=>{
    const lines=initialReview(sampleRun()).map((l,i)=>i===0?{...l,price:'0.79'}:i===1?{...l,status:'removed' as const}:l);
    expect(toSaveRequest(lines,{customerName:' Acme ',reference:'',level:'strict'})).toEqual({
      customerName:'Acme',reference:'',matchStrictness:'strict',
      lines:[
        {unmatched:false,sku:'12108-BDL',matchedBy:'auto',originalText:'S-4128 12 x 10 x 8" Corrugated Boxes 10 bundles',quantity:250,unit:'each',quantityUnclear:false,customerQuantity:'10 bundles',unitPrice:0.79,matchScore:1},
        {unmatched:true,originalText:'Reclosable bags 30x30 3 mil 4 cases',quantity:4,unit:'case',quantityUnclear:false,nearMisses:[{sku:'PB3669',score:0.56},{sku:'PB3670',score:0.42}]},
        {unmatched:true,originalText:'Foam peanuts 14 cu ft 2 bags',quantity:2,unit:'bag',quantityUnclear:false,nearMisses:[]},
      ],
    });
  });

  it('saves a matched line whose quantity could not be converted as unclear, in the pricing unit',()=>{
    const run=sampleRun();
    run.lines[0]={...run.lines[0],rawText:'S-4128 12 x 10 x 8" Corrugated Boxes 10 pallets',quantity:10,unit:'pallet'};
    const lines=initialReview(run).map((l,i)=>i===0?{...l,price:'1'}:i===1?{...l,status:'removed' as const}:l);
    expect(toSaveRequest(lines,{customerName:'',reference:'',level:'strict'}).lines[0]).toMatchObject({quantity:10,unit:'each',quantityUnclear:true,customerQuantity:'10 pallets'});
  });

  it('counts the matched lines whose quantity still needs a check (not the ones without a quantity: Save already asks for those)',()=>{
    const run=sampleRun();
    run.lines[0]={...run.lines[0],rawText:'S-4128 12 x 10 x 8" Corrugated Boxes 10 pallets',quantity:10,unit:'pallet'};
    let lines=initialReview(run);
    expect(quantityChecks(lines)).toBe(1);
    expect(quantityChecksMessage(1)).toBe('1 line has a quantity to check.');
    expect(quantityChecksMessage(2)).toBe('2 lines have a quantity to check.');
    expect(quantityChecksMessage(0)).toBeNull();
    lines=lines.map((l,i)=>i===0?editQuantity(l,'5000'):l);
    expect(quantityChecks(lines)).toBe(0);
    lines=lines.map((l,i)=>i===1?editQuantity(l,'3'):l);
    expect(quantityChecks(lines.map((l,i)=>i===1?{...l,quantityUnclear:true,quantityChecked:false}:l))).toBe(1);
  });
});

const PLT:ScoredItem={sku:'12108-PLT',description:'12x10x8" Corrugated Boxes, 32 ECT, pallet pricing',pack:'Bundle of 25',category:'Boxes',listPrice:0.71,listPriceUnit:'each',pricing:pricingUnit('Each',25),score:0.9};
const BAGS:ScoredItem={sku:'PB3669',description:'Reclosable Poly Bags 30x30" 2 Mil',pack:'Case of 250',category:'Poly Bags',listPrice:89,listPriceUnit:'case',pricing:pricingUnit('Case of 250',1),score:0.56};
const ROLLS:ScoredItem={sku:'R1',description:'Labels 4x6',pack:'Roll of 250',category:'Labels',listPrice:12,listPriceUnit:'roll',pricing:pricingUnit('Roll of 250',1),score:0.5};

describe('the quantity on a line',()=>{
  it('flags an unconvertible unit with what the customer wrote until the rep edits the quantity, then keeps it as an aside',()=>{
    const run=sampleRun();
    run.lines[0]={...run.lines[0],rawText:'S-4128 12 x 10 x 8" Corrugated Boxes 10 pallets',quantity:10,unit:'pallet'};
    let line=initialReview(run)[0];
    expect(line.quantity).toBe('10');
    expect(quantityFlag(line)).toBe('Check quantity (customer wrote: 10 pallets)');
    expect(quantityAside(line)).toBeNull();
    line=editQuantity(line,'2500');
    expect(line.quantity).toBe('2500');
    expect(quantityFlag(line)).toBeNull();
    expect(quantityAside(line)).toBe('Customer wrote: 10 pallets');
  });

  it('shows the conversion note as an aside, not a flag, and keeps it after an edit',()=>{
    let line=initialReview(sampleRun())[0];
    expect(quantityFlag(line)).toBeNull();
    expect(quantityAside(line)).toBe('Customer asked for 10 bundles = 250 each');
    line=editQuantity(line,'275');
    expect(quantityAside(line)).toBe('Customer asked for 10 bundles = 250 each');
  });

  it('flags a missing or unclear quantity with "Check quantity" until the rep enters one',()=>{
    let line=initialReview(sampleRun())[1];
    expect(quantityFlag(line)).toBe('Check quantity');
    line=editQuantity(line,'3');
    expect(quantityFlag(line)).toBeNull();
    line=editQuantity(line,'');
    expect(quantityFlag(line)).toBe('Check quantity');
  });
});

describe('withItem (Swap and "Use this item")',()=>{
  // An item that fully accounts for the line's description (ScoredItem.accounted), and one that does not.
  const PLT_OK:ScoredItem={...PLT,accounted:true};

  it('re-derives the unit from the new item and re-runs the conversion from the customer\'s quantity',()=>{
    const lines=initialReview(sampleRun());
    // The box line swapped for a box priced each in bundles that accounts for the line: 10 bundles = 250 each again, even after an edit.
    const swapped=withItem(editQuantity({...lines[0],price:'0.8'},'300'),PLT_OK,'rep');
    expect(swapped).toMatchObject({item:{sku:'12108-PLT'},quantity:'250',unit:'each',quantityChecked:false,price:'0.8'});
    expect(swapped.quantityNote?.text).toBe('Customer asked for 10 bundles = 250 each');
    // An unmatched line of 4 cases promoted to a bag that does not account for it (3 mil asked, 2 mil sold): 4 cases kept and flagged.
    const promoted=withItem(lines[2],BAGS,'rep');
    expect(promoted).toMatchObject({status:'matched',restoreTo:'matched',item:{sku:'PB3669'},matchedBy:'rep',score:0.56,quantity:'4',unit:'case',price:''});
    expect(quantityFlag(promoted)).toBe('Check quantity (customer wrote: 4 cases)');
    // The same pick, accounted for: the same unit, no note.
    expect(withItem(lines[2],{...BAGS,accounted:true},'rep')).toMatchObject({quantity:'4',unit:'case',quantityNote:null});
  });

  it('fails closed when the item\'s accounting is not known (a pick without `accounted`)',()=>{
    const box=initialReview(sampleRun())[0];
    expect(quantityFlag(withItem(box,PLT,'rep'))).toBe('Check quantity (customer wrote: 10 bundles)');
  });

  it('clears the price when the new item is priced per another unit, and converts or flags the quantity for it',()=>{
    const box=initialReview(sampleRun())[0];
    const bags=withItem({...box,price:'0.8'},{...BAGS,accounted:true},'rep');
    expect(bags).toMatchObject({unit:'case',quantity:'10',price:''});
    expect(quantityFlag(bags)).toBe('Check quantity (customer wrote: 10 bundles)');

    const pieces={...initialReview(sampleRun())[3],customerQuantity:500,customerUnit:'each',quantity:'500',customerLeftover:null};
    expect(withItem(pieces,{...ROLLS,accounted:true},'rep')).toMatchObject({unit:'roll',quantity:'2',quantityNote:{kind:'converted',text:'Customer asked for 500 each = 2 rolls'}});
  });

  it('counts the item\'s own product noun as pieces: 4 rolls of stretch wrap priced per case of 4 is 1 case',()=>{
    const wrapLine={...initialReview(sampleRun())[3],customerQuantity:4,customerUnit:'roll',quantity:'4',unit:'roll',customerLeftover:null};
    const wrap:ScoredItem={sku:'SF188CAST',description:'Cast Stretch Wrap, Hand Length, 18"x1500\' 80 Gauge',pack:'Case of 4',category:'stretch-wrap',listPrice:81.08,listPriceUnit:'case',
      pricing:pricingUnit('Case of 4',1,{description:'Cast Stretch Wrap, Hand Length, 18"x1500\' 80 Gauge',category:'stretch-wrap'}),score:1,accounted:true};
    const promoted=withItem(wrapLine,wrap,'rep');
    expect(promoted).toMatchObject({quantity:'1',unit:'case',quantityNote:{kind:'converted',text:'Customer asked for 4 rolls = 1 case'}});
    expect(quantityFlag(promoted)).toBeNull();
    expect(quantityAside(promoted)).toBe('Customer asked for 4 rolls = 1 case');
  });

  it('flags a raw line with anything besides the description, the SKU and the quantity, on the initial match, Swap and "Use this item" (B10b)',()=>{
    const run=sampleRun();
    run.lines[0]={...run.lines[0],rawText:'S-4128 12 x 10 x 8" Corrugated Boxes, pack size 50, 4 bundles',quantity:4,unit:'bundle'};
    run.lines[2]={...run.lines[2],rawText:'Corrugated Boxes 12x10x8 32 ECT 50 x 4 bundles',description:'Corrugated Boxes 12x10x8 32 ECT',quantity:4,unit:'bundle'};
    const lines=initialReview(run);
    expect(lines[0].customerLeftover).toBe('pack size 50');
    // The auto match accounts for the description, but the raw line says more: 4 kept, flagged, saved unclear with the customer's words.
    expect(lines[0]).toMatchObject({quantity:'4',unit:'each',quantityNote:{kind:'check',wrote:'4 bundles, pack size 50'}});
    expect(quantityFlag(lines[0])).toBe('Check quantity (customer wrote: 4 bundles, pack size 50)');
    expect(toSaveRequest([{...lines[0],price:'1'}],{customerName:'',reference:'',level:'strict'}).lines[0]).toMatchObject({quantity:4,unit:'each',quantityUnclear:true,customerQuantity:'4 bundles, pack size 50'});
    // "50 x 4 bundles": the 50 is left over, whatever item is picked.
    const picked=withItem(lines[2],PLT_OK,'rep');
    expect(picked).toMatchObject({quantity:'4',unit:'each',quantityNote:{kind:'check',wrote:'4 bundles, 50'}});
    // Once the rep types a quantity, the flag becomes an aside with the customer's words.
    const edited=editQuantity(picked,'200');
    expect([quantityFlag(edited),quantityAside(edited)]).toEqual([null,'Customer wrote: 4 bundles, 50']);
  });

  it('checks the kind of a stated pack against the item: a box of 100 is not a case of 100',()=>{
    const run=sampleRun();
    run.lines[2]={...run.lines[2],rawText:'Thermal Mailers 8x11 100 per box, 2 cases',description:'Thermal Mailers 8x11 100 per box',quantity:2,unit:'case',packContainers:['box']};
    const INM811:ScoredItem={sku:'INM811',description:'Thermal Mailers 8x11"',pack:'Case of 100',category:'mailers',listPrice:80,listPriceUnit:'case',
      pricing:pricingUnit('Case of 100',1,{description:'Thermal Mailers 8x11"',category:'mailers'}),score:0.9,accounted:true};
    const line=initialReview(run)[2];
    expect(line.packContainers).toEqual(['box']);
    expect(quantityFlag(withItem(line,INM811,'rep'))).toBe('Check quantity (customer wrote: 2 cases)');
    expect(withItem({...line,packContainers:['case']},INM811,'rep')).toMatchObject({quantity:'2',quantityNote:null});
  });

  it('keeps the quantity blank when the customer gave none',()=>{
    const wrap=initialReview(sampleRun())[1];
    expect(withItem(wrap,BAGS,'rep')).toMatchObject({quantity:'',unit:'case',quantityNote:null});
  });
});
