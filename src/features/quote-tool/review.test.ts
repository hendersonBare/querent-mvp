import {describe,expect,it} from 'vitest';
import {
  blockersMessage,formatMoney,unitLabel,initialReview,lineCents,listPriceLabel,parsePrice,parseQuantity,saveBlockers,toSaveRequest,totalCents,
  type ReviewLine,
} from './review';
import {sampleRun} from './test-fixtures';

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

describe('unitLabel',()=>{
  it('reads the unit with its quantity',()=>{
    expect(unitLabel(4,'roll')).toBe('rolls');
    expect(unitLabel(1,'case')).toBe('case');
    expect(unitLabel(2,'box')).toBe('boxes');
    expect(unitLabel(3,'each')).toBe('each');
    expect(unitLabel(null,'bundle')).toBe('bundles');
    expect(unitLabel(2,null)).toBeNull();
  });
});

describe('the review state',()=>{
  it('starts with matched lines unpriced and quantities as parsed (blank when unclear)',()=>{
    const lines=initialReview(sampleRun());
    expect(lines.map(l=>[l.status,l.price,l.quantity,l.matchedBy])).toEqual([
      ['matched','','10','auto'],['matched','','','auto'],['unmatched','','4',null],['unmatched','','2',null],
    ]);
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
    expect(totalCents(lines)).toBe(790+7350);
    expect(totalCents(lines.map((l,i)=>i===1?{...l,status:'removed' as const}:l))).toBe(790);
  });

  it('builds the save body: matched lines by SKU with who matched them, unmatched lines with near-miss SKUs and scores, removed lines left out',()=>{
    const lines=initialReview(sampleRun()).map((l,i)=>i===0?{...l,price:'0.79'}:i===1?{...l,status:'removed' as const}:l);
    expect(toSaveRequest(lines,{customerName:' Acme ',reference:'',level:'strict'})).toEqual({
      customerName:'Acme',reference:'',matchStrictness:'strict',
      lines:[
        {unmatched:false,sku:'12108-BDL',matchedBy:'auto',originalText:'S-4128 12 x 10 x 8" Corrugated Boxes 10 bundles',quantity:10,unit:'bundle',quantityUnclear:false,unitPrice:0.79,matchScore:1},
        {unmatched:true,originalText:'Reclosable bags 30x30 3 mil 4 cases',quantity:4,unit:'case',quantityUnclear:false,nearMisses:[{sku:'PB3669',score:0.56},{sku:'PB3670',score:0.42}]},
        {unmatched:true,originalText:'Foam peanuts 14 cu ft 2 bags',quantity:2,unit:'bag',quantityUnclear:false,nearMisses:[]},
      ],
    });
  });
});
