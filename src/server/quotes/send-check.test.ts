import {describe,expect,it} from 'vitest';
import {CALL_FOR_FREIGHT,resolveFreight,type FreightQuote} from '@/server/freight/engine';
import {sendBlockers,type SendCheckQuote} from './send-check';

// Spec §4: Send is blocked when the quote is unfinished: no lines; any line with zero qty or no
// price; freight still "call for freight"; delivery with no ship-to. Lines below floor only warn.

const line=(line_no:number,qty:number,unit_price:number|null,sku=`SKU-${line_no}`)=>({id:`q-1-${line_no}`,line_no,sku,qty,unit_price});
const willCall:SendCheckQuote={fulfillment:'will_call',ship_to_address:null,lines:[line(1,10,31.5,'HCS-12-13-2G8'),line(2,6,36,'CW-45-045-T1')]};
const delivery:SendCheckQuote={...willCall,fulfillment:'delivery',ship_to_address:'1800 W 10950 S, South Jordan, UT 84095'};

const computed=(rule:FreightQuote['rule'],amount:FreightQuote['amount']):FreightQuote=>({rule,amount,miles:null,formula:null,explanation:''});
const priced=resolveFreight(computed('distance',62.5),null);
const callForFreight=resolveFreight(computed('beyond_radius',CALL_FOR_FREIGHT),null);
const noShipToFreight=resolveFreight(computed('no_ship_to',CALL_FOR_FREIGHT),null);
const overridden=resolveFreight(computed('no_ship_to',CALL_FOR_FREIGHT),{amount:40,reason:'Customer truck meets us'});

describe('sendBlockers',()=>{
  it('passes a finished will-call quote and a finished delivery quote',()=>{
    expect(sendBlockers(willCall,resolveFreight(computed('will_call',0),null))).toEqual([]);
    expect(sendBlockers(delivery,priced)).toEqual([]);
  });

  it('blocks a quote with no lines',()=>{
    expect(sendBlockers({...willCall,lines:[]},priced)).toEqual([{code:'no_lines',line_id:null,message:'The quote has no lines.'}]);
  });

  it('blocks each line with a quantity of 0',()=>{
    expect(sendBlockers({...willCall,lines:[line(1,0,31.5,'HCS-12-13-2G8'),line(2,6,36),line(3,0,12)]},priced)).toEqual([
      {code:'zero_qty',line_id:'q-1-1',message:'Line 1 (HCS-12-13-2G8) has a quantity of 0.'},
      {code:'zero_qty',line_id:'q-1-3',message:'Line 3 (SKU-3) has a quantity of 0.'},
    ]);
  });

  it('blocks each line with no price, or a price below $0',()=>{
    expect(sendBlockers({...willCall,lines:[line(1,10,null,'HCS-12-13-2G8'),line(2,6,-1),line(3,6,Number.NaN)]},priced)).toEqual([
      {code:'no_price',line_id:'q-1-1',message:'Line 1 (HCS-12-13-2G8) has no price.'},
      {code:'no_price',line_id:'q-1-2',message:'Line 2 (SKU-2) has a price below $0.'},
      {code:'no_price',line_id:'q-1-3',message:'Line 3 (SKU-3) has no price.'},
    ]);
  });

  it('lets a $0 line through: it is priced, and only warns as below floor',()=>{
    expect(sendBlockers({...willCall,lines:[line(1,1,0)]},priced)).toEqual([]);
  });

  it('reports both problems on a line with qty 0 and no price',()=>{
    expect(sendBlockers({...willCall,lines:[line(1,0,null)]},priced).map(b=>b.code)).toEqual(['zero_qty','no_price']);
  });

  it('blocks while freight is still call for freight',()=>{
    expect(sendBlockers(delivery,callForFreight)).toEqual([{code:'call_for_freight',line_id:null,message:'Freight is still call for freight: set it by hand before sending.'}]);
  });

  it('sends once the rep overrides call-for-freight on a delivery that has a ship-to',()=>{
    expect(sendBlockers(delivery,resolveFreight(computed('beyond_radius',CALL_FOR_FREIGHT),{amount:180,reason:'LTL quote from carrier'}))).toEqual([]);
  });

  it('blocks a delivery with no ship-to, and says freight is unpriced too',()=>{
    expect(sendBlockers({...delivery,ship_to_address:null},noShipToFreight).map(b=>b.code)).toEqual(['no_ship_to','call_for_freight']);
    expect(sendBlockers({...delivery,ship_to_address:'   '},noShipToFreight)[0]).toEqual({code:'no_ship_to',line_id:null,message:'Delivery has no ship-to address on file: switch to will call to send it.'});
  });

  it('still blocks a delivery with no ship-to after a freight override clears call-for-freight',()=>{
    expect(overridden.unresolved).toBe(false);
    expect(sendBlockers({...delivery,ship_to_address:null},overridden)).toEqual([{code:'no_ship_to',line_id:null,message:'Delivery has no ship-to address on file: switch to will call to send it.'}]);
  });

  it('does not need a ship-to for will call',()=>{
    expect(sendBlockers({...willCall,ship_to_address:null},resolveFreight(computed('will_call',0),null))).toEqual([]);
  });

  it('lists every blocker at once, lines first',()=>{
    expect(sendBlockers({fulfillment:'delivery',ship_to_address:null,lines:[line(1,0,null)]},noShipToFreight).map(b=>b.code))
      .toEqual(['zero_qty','no_price','no_ship_to','call_for_freight']);
    expect(sendBlockers({fulfillment:'delivery',ship_to_address:null,lines:[]},noShipToFreight).map(b=>b.code))
      .toEqual(['no_lines','no_ship_to','call_for_freight']);
  });
});
