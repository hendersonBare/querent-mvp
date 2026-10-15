import {describe,expect,it} from 'vitest';
import {applyPatch,parsePatch} from './patch';
import {LINE_IDS,quote} from './test-fixtures';

// PATCH /api/quotes/[id] (docs/boxt/plan.md B6): the body names the customer, the reference, and the
// lines to keep (by id, in order) with their quantity and unit price. Everything else on a line
// (matched_by, the customer's original text, the unmatched flag, the near-miss snapshot) stays as stored.

const [A,B,C,U]=LINE_IDS;

describe('parsePatch',()=>{
  it('accepts the header fields and the lines to keep',()=>{
    const body={customerName:'Acme',reference:'PO-1',lines:[{id:A,quantity:2,unitPrice:1.25},{id:U}]};
    expect(parsePatch(body)).toEqual({ok:true,patch:body});
    expect(parsePatch({})).toEqual({ok:true,patch:{}});
  });

  it.each([
    ['not an object',[1,2]],
    ['null',null],
    ['an unknown field',{customerName:'x',sku:'M1044'}],
    ['an unknown line field',{lines:[{id:A,quantity:1,unitPrice:1,matchedBy:'rep'}]}],
    ['a customer name over 200 characters',{customerName:'x'.repeat(201)}],
    ['a reference that is not text',{reference:12}],
    ['no lines',{lines:[]}],
    ['more than 200 lines',{lines:Array.from({length:201},()=>({id:A}))}],
    ['a line id that is not a uuid',{lines:[{id:'line-1'}]}],
    ['the same line twice',{lines:[{id:A,quantity:1,unitPrice:1},{id:A,quantity:1,unitPrice:1}]}],
    ['a quantity of 0',{lines:[{id:A,quantity:0,unitPrice:1}]}],
    ['a negative quantity',{lines:[{id:A,quantity:-1,unitPrice:1}]}],
    ['a quantity as text',{lines:[{id:A,quantity:'2',unitPrice:1}]}],
    ['a negative price',{lines:[{id:A,quantity:1,unitPrice:-0.01}]}],
    ['a price with 5 decimals',{lines:[{id:A,quantity:1,unitPrice:1.23456}]}],
    ['a price over the limit',{lines:[{id:A,quantity:1,unitPrice:100_000_000}]}],
    ['an infinite quantity',{lines:[{id:A,quantity:Infinity,unitPrice:1}]}],
  ])('refuses %s',(_label,body)=>{
    const result=parsePatch(body);
    expect(result.ok).toBe(false);
    if(!result.ok)expect(result.error).toMatch(/\S/);
  });

  it('accepts a price of 0 and prices with up to 4 decimals',()=>{
    expect(parsePatch({lines:[{id:A,quantity:1,unitPrice:0}]}).ok).toBe(true);
    expect(parsePatch({lines:[{id:A,quantity:2.5,unitPrice:0.1234}]}).ok).toBe(true);
  });
});

describe('applyPatch',()=>{
  it('changes quantity and price, keeps every other stored field, and drops lines left out',()=>{
    const q=quote();
    const result=applyPatch(q,{customerName:'Acme Ltd',reference:'PO-2',lines:[{id:C,quantity:6,unitPrice:30},{id:A,quantity:1000,unitPrice:1},{id:U}]});
    expect(result.ok).toBe(true);
    if(!result.ok)return;
    expect(result.kept).toBe(3);
    expect(result.removed).toBe(1);
    expect(result.update.customerName).toBe('Acme Ltd');
    expect(result.update.reference).toBe('PO-2');
    const lines=result.update.lines!;
    const [c,a,u]=lines;
    // In the order given.
    expect(lines.map(l=>l.sku)).toEqual(['B855SS','12108-BDL',null]);
    const stored=(i:number)=>{const {id:_i,position:_p,createdAt:_c,updatedAt:_u,...rest}=q.lines[i];return rest;};
    expect(c).toEqual({...stored(2),quantity:6,unitPrice:30});
    expect(c.matchedBy).toBe('rep');
    expect(a).toEqual({...stored(0),quantity:1000,unitPrice:1});
    expect(u).toEqual(stored(3));
    expect(u.nearMisses).toHaveLength(2);
    expect(u.unmatched).toBe(true);
  });

  it('leaves the lines alone when the patch has none',()=>{
    const result=applyPatch(quote(),{reference:'PO-9'});
    expect(result).toEqual({ok:true,update:{reference:'PO-9'},kept:4,removed:0});
  });

  it('keeps a stored quantity or price the patch does not name',()=>{
    const result=applyPatch(quote(),{lines:[{id:B,unitPrice:0.4}]});
    expect(result.ok&&result.update.lines![0]).toMatchObject({quantity:200,unitPrice:0.4});
  });

  it('refuses a line id the quote does not have',()=>{
    expect(applyPatch(quote(),{lines:[{id:'99999999-9999-4999-8999-999999999999',quantity:1,unitPrice:1}]})).toMatchObject({ok:false});
  });

  it('refuses a matched line without both a quantity and a unit price',()=>{
    expect(applyPatch(quote(),{lines:[{id:A,quantity:null,unitPrice:1}]})).toMatchObject({ok:false});
    expect(applyPatch(quote(),{lines:[{id:A,quantity:1,unitPrice:null}]})).toMatchObject({ok:false});
  });

  it('refuses a price on an unmatched line (it has no item to price)',()=>{
    expect(applyPatch(quote(),{lines:[{id:A},{id:U,unitPrice:2}]})).toMatchObject({ok:false});
  });
});
