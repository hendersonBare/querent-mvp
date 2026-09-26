import {describe,expect,it,vi} from 'vitest';
import type {Upsell,UpsellDraft} from './rules';
import {countOf,itemNoun,lowerFirst,packUnit,pluralize,templateWording,wordUpsells} from './wording';

const bolts={line_id:'q-1-1',item_id:'HCS-12-13-2G8',sku:'HCS-12-13-2G8',description:'Hex cap screw 1/2-13 x 2 in, Grade 8, yellow zinc'};
const wheels={line_id:'q-1-2',item_id:'CW-45-045-T1',sku:'CW-45-045-T1',description:'Cut-off wheel 4.5 x .045 x 7/8 in, Type 1'};
const item=(sku:string,description:string,pack:string,case_qty=10)=>({id:sku,sku,description,pack,case_qty});
const priced={unit_price:10,price_basis:'customer' as const,unit_cost:5,gp_gain:25};

function fastener(evidence:Partial<Extract<UpsellDraft,{kind:'matching_fastener'}>['evidence']>={},qty=5):UpsellDraft{
  return {id:'matching_fastener:HN-12-13-G8',kind:'matching_fastener',action:{type:'add_line',item_id:'HN-12-13-G8',qty},item:item('HN-12-13-G8','Hex nut 1/2-13, Grade 8, yellow zinc','Box of 100'),
    qty,anchor:bolts,...priced,evidence:{part:'nut',bolt:{diameter:'1/2',thread:'13',grade:'8'},bolt_pieces:500,pack_pieces:100,history:null,...evidence}};
}
function bump(from:number,to:number,caseQty:number,pack='Box of 25',description=wheels.description):UpsellDraft{
  return {id:'full_case:X',kind:'full_case',action:{type:'set_qty',line_id:'q-1-2',item_id:'X',from_qty:from,to_qty:to},item:item('X',description,pack,caseQty),qty:to,anchor:wheels,...priced,
    evidence:{case_qty:caseQty,from_qty:from,to_qty:to,cases:to/caseQty}};
}
function together(together:number,orders:number,anchor=wheels):UpsellDraft{
  return {id:'bought_together:FD-45-60Z',kind:'bought_together',action:{type:'add_line',item_id:'FD-45-60Z',qty:3},item:item('FD-45-60Z','Flap disc 4.5 in, 60 grit zirconia','Box of 10',4),
    qty:3,anchor,...priced,evidence:{orders_together:together,anchor_orders:orders}};
}
const worded=(draft:UpsellDraft):Upsell=>({...draft,wording:templateWording(draft)}) as Upsell;

describe('templateWording',()=>{
  it('matching fastener: the bolts it matches, how many it covers, and the history when there is one',()=>{
    expect(templateWording(fastener())).toEqual({title:'Hex nut 1/2-13, Grade 8, yellow zinc (box of 100)',reason:'Matches the 1/2-13 Grade 8 bolts: 5 boxes of 100 cover all 500.'});
    expect(templateWording(fastener({history:{orders_together:4,anchor_orders:5}})).reason)
      .toBe('Matches the 1/2-13 Grade 8 bolts: 5 boxes of 100 cover all 500. Bought with these bolts on 4 of the 5 orders that had them in the last 12 months.');
    expect(templateWording(fastener({history:{orders_together:5,anchor_orders:5}})).reason).toContain('on all 5 orders that had them');
    expect(templateWording(fastener({bolt_pieces:null,pack_pieces:null},3)).reason).toBe('Matches the 1/2-13 Grade 8 bolts on this quote.');
    expect(templateWording(fastener({bolt_pieces:50,pack_pieces:100},1)).reason).toBe('Matches the 1/2-13 Grade 8 bolts: 1 box of 100 covers all 50.');
  });

  it('full case: the bump, and why the current qty is a broken case',()=>{
    expect(templateWording(bump(6,8,4))).toEqual({title:'Bump cut-off wheels to 8 boxes (2 full cases)',reason:'A case holds 4 boxes, so 6 leaves a broken case.'});
    expect(templateWording(bump(5,10,10,'Box of 100','Hex nut 1/2-13, Grade 8, yellow zinc'))).toEqual({title:'Bump hex nuts to 10 boxes (1 full case)',reason:'A full case is 10 boxes; 5 is a broken case.'});
    expect(templateWording(bump(12,20,10,'Each','Ratchet strap 2 in x 27 ft, 3,333 lb WLL, J-hooks'))).toEqual({title:'Bump ratchet straps to 20 (2 full cases)',reason:'A case holds 10, so 12 leaves a broken case.'});
  });

  it('bought together: which quote item, and on how many of its orders',()=>{
    expect(templateWording(together(4,5))).toEqual({title:'Flap disc 4.5 in, 60 grit zirconia (box of 10)',reason:'Bought with cut-off wheels on 4 of the 5 orders that had them in the last 12 months.'});
    expect(templateWording(together(3,3)).reason).toBe('Bought with cut-off wheels on all 3 orders that had them in the last 12 months.');
    expect(templateWording(together(1,1)).reason).toBe('Bought with cut-off wheels on the one order that had them in the last 12 months.');
    const gloves={...wheels,description:'Nitrile disposable gloves, 8 mil, black, size L'};
    expect(templateWording(together(2,4,gloves)).reason).toBe('Bought with nitrile disposable gloves on 2 of the 4 orders that had them in the last 12 months.');
  });

  it('is deterministic',()=>{
    expect(templateWording(together(4,5))).toEqual(templateWording(together(4,5)));
  });
});

describe('wording helpers',()=>{
  it('pluralize handles the catalog\'s nouns',()=>{
    expect(['cut-off wheel','hex cap screw','nitrile disposable gloves','safety glasses','box','utility knife','bungee cord assembly','brush','ratchet strap'].map(pluralize))
      .toEqual(['cut-off wheels','hex cap screws','nitrile disposable gloves','safety glasses','boxes','utility knives','bungee cord assemblies','brushes','ratchet straps']);
  });
  it('lowerFirst keeps acronyms and codes',()=>{
    expect(lowerFirst('Hex cap screw')).toBe('hex cap screw');
    expect(lowerFirst('N95 particulate respirator')).toBe('N95 particulate respirator');
    expect(lowerFirst('ANSI vest')).toBe('ANSI vest');
  });
  it('packUnit and countOf',()=>{
    expect(['Box of 25','Case of 1,000','4 pack','25 lb box','Bale of 100','Case of 4 rolls','Each'].map(packUnit)).toEqual(['box','case','pack','box','bale','case',null]);
    expect([countOf(8,'box'),countOf(1,'case'),countOf(20,null)]).toEqual(['8 boxes','1 case','20']);
  });
  it('itemNoun is the plural short name',()=>{
    expect(itemNoun('Cut-off wheel 4.5 x .045 x 7/8 in, Type 1')).toBe('cut-off wheels');
    expect(itemNoun('Safety glasses, clear anti-fog')).toBe('safety glasses');
  });
});

describe('wordUpsells (a live writer, e.g. Claude)',()=>{
  const chips=[worded(fastener()),worded(together(4,5))];

  it('keeps the template wording without a writer',async()=>{
    expect(await wordUpsells(chips)).toEqual(chips);
  });

  it('uses the writer\'s wording, falling back to the template for anything missing or blank',async()=>{
    const writer=vi.fn(async()=>[{title:'  Grade 8 nuts for the bolts ',reason:'They always buy nuts with these.'},{title:'',reason:'   '}]);
    const out=await wordUpsells(chips,writer);
    expect(writer).toHaveBeenCalledWith(chips);
    expect(out[0].wording).toEqual({title:'Grade 8 nuts for the bolts',reason:'They always buy nuts with these.'});
    expect(out[1].wording).toEqual(chips[1].wording);
    expect(out.map(u=>u.id)).toEqual(chips.map(u=>u.id));
  });

  it('keeps the template when the writer fails or returns too few entries',async()=>{
    expect(await wordUpsells(chips,async()=>{throw new Error('model unavailable');})).toEqual(chips);
    expect((await wordUpsells(chips,async()=>[{reason:'Only one.'}])).map(u=>u.wording)).toEqual([{title:chips[0].wording.title,reason:'Only one.'},chips[1].wording]);
  });

  it('does not call the writer for no chips',async()=>{
    const writer=vi.fn(async()=>[]);
    expect(await wordUpsells([],writer)).toEqual([]);
    expect(writer).not.toHaveBeenCalled();
  });
});
