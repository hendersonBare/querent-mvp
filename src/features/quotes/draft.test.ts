import {describe,expect,it} from 'vitest';
import {checkDraft,draftFrom,draftTotal,parsePrice,parseQuantity,toPatch,type QuoteDraft} from './draft';
import {LIMIT_COPY} from './limits';
import {LINE_IDS,quote} from './test-fixtures';

// Edit mode on /quotes/[id] (docs/boxt/plan.md B6): the inputs hold text; Save is enabled only when every
// kept matched line has a quantity above 0 and a unit price of 0 or more with up to 4 decimals, and at
// least one line is left.

const [A,B,C,U]=LINE_IDS;

describe('parseQuantity',()=>{
  it.each([['1',1],['500',500],['2.5',2.5],['0.25',0.25],[' 12 ',12],['1,500',1500],['1.234',1.234],['0.001',0.001],['1.2500',1.25]])('%j → %s',(text,value)=>{
    expect(parseQuantity(text)).toBe(value);
  });
  it.each(['','0','0.0','-1','abc','1.2.3','1e3','Infinity','100000000000','1.2345','0.0001'])('%j is not a quantity',text=>{
    expect(parseQuantity(text)).toBeNull();
  });
});

describe('parsePrice',()=>{
  it.each([['0',0],['1',1],['1.05',1.05],['0.375',0.375],['0.1234',0.1234],['$1.50',1.5],['1,250.00',1250],['.5',0.5]])('%j → %s',(text,value)=>{
    expect(parsePrice(text)).toBe(value);
  });
  it.each(['','-1','1.23456','abc','1e2','100000000'])('%j is not a price',text=>{
    expect(parsePrice(text)).toBeNull();
  });
});

describe('the draft',()=>{
  it('starts from the quote: header fields, and each line\'s quantity and price as text',()=>{
    const draft=draftFrom(quote());
    expect(draft.customerName).toBe('Acme Fulfilment');
    expect(draft.reference).toBe('PO-7781');
    expect(draft.lines.map(l=>[l.id,l.quantity,l.unitPrice])).toEqual([[A,'1500','1.05'],[B,'200','0.375'],[C,'4','31.495'],[U,'250','']]);
    expect(checkDraft(draft)).toMatchObject({ok:true});
  });

  it('is invalid while a matched line lacks a quantity or a price, or has a bad one',()=>{
    const q=quote();
    const edit=(i:number,over:Partial<QuoteDraft['lines'][number]>)=>{const d=draftFrom(q);d.lines[i]={...d.lines[i],...over};return d;};
    for(const [i,over,field] of [
      [0,{quantity:''},'quantity'],[0,{quantity:'0'},'quantity'],[0,{quantity:'-2'},'quantity'],
      [1,{unitPrice:''},'unitPrice'],[1,{unitPrice:'1.23456'},'unitPrice'],[1,{unitPrice:'-1'},'unitPrice'],
    ] as const){
      const result=checkDraft(edit(i,over));
      expect(result.ok,JSON.stringify(over)).toBe(false);
      expect(result.lines[LINE_IDS[i]]?.[field]).toMatch(/\S/);
    }
  });

  it('says why a quantity is refused: above 0, up to 3 decimals, at least 0.001',()=>{
    const q=quote();
    const message=(quantity:string)=>{const d=draftFrom(q);d.lines[0]={...d.lines[0],quantity};return checkDraft(d).lines[A]?.quantity;};
    expect(message('1.2345')).toBe(LIMIT_COPY.quantityDecimals);
    expect(message('0.0001')).toBe(LIMIT_COPY.quantityMinimum);
    expect(message('0')).toBe(LIMIT_COPY.quantityPositive);
    expect(message('')).toBe(LIMIT_COPY.required);
    expect(message('1.234')).toBeUndefined();
    const price=(unitPrice:string)=>{const d=draftFrom(q);d.lines[0]={...d.lines[0],unitPrice};return checkDraft(d).lines[A]?.unitPrice;};
    expect(price('1.23456')).toBe(LIMIT_COPY.priceDecimals);
    expect(price('-1')).toBe(LIMIT_COPY.priceInvalid);
  });

  it('does not ask for a price on an unmatched line',()=>{
    const d=draftFrom(quote());
    expect(checkDraft(d).lines[U]).toBeUndefined();
  });

  it('is invalid once every line is removed',()=>{
    const d={...draftFrom(quote()),lines:[]};
    expect(checkDraft(d)).toMatchObject({ok:false,form:expect.stringMatching(/at least one line/i)});
  });

  it('is invalid with a customer name or reference over 200 characters',()=>{
    expect(checkDraft({...draftFrom(quote()),customerName:'x'.repeat(201)})).toMatchObject({ok:false,customerName:expect.any(String)});
    expect(checkDraft({...draftFrom(quote()),reference:'x'.repeat(201)})).toMatchObject({ok:false,reference:expect.any(String)});
  });

  it('becomes the PATCH body: header fields, and the kept lines with numbers (none for an unmatched line)',()=>{
    const d=draftFrom(quote());
    d.customerName=' Acme Ltd ';
    d.lines=[{...d.lines[1],quantity:'250',unitPrice:'$0.40'},d.lines[3]];
    expect(toPatch(d)).toEqual({customerName:'Acme Ltd',reference:'PO-7781',lines:[{id:B,quantity:250,unitPrice:0.4},{id:U}]});
  });

  it('totals the valid priced matched lines as the user types',()=>{
    const q=quote();
    const d=draftFrom(q);
    expect(draftTotal(d)).toBe(1775.98);
    d.lines=d.lines.filter(l=>l.id!==A);
    expect(draftTotal(d)).toBe(200.98);
    d.lines[0]={...d.lines[0],unitPrice:'oops'};
    expect(draftTotal(d)).toBe(125.98);
  });
});
