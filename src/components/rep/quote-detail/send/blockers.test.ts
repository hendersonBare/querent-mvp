import {describe,expect,it} from 'vitest';
import {SEND_BLOCKER_CODES,type SendBlocker} from '@/server/quotes';
import {blockerSummary,blockerTarget} from './blockers';

// Send blockers in the editor (decision 44; plan U4): Approve and send names the first blocker under
// it with "+N more", and clicking it jumps to the line or field at fault. Quote-level blockers open
// Quote details at their section; a quote with no lines goes to + Add item.

const blocker=(code:SendBlocker['code'],line_id:string|null=null,message=`${code} message`):SendBlocker=>({code,line_id,message});

describe('blockerTarget',()=>{
  it('sends every blocker code somewhere',()=>{
    for(const code of SEND_BLOCKER_CODES)expect(blockerTarget(blocker(code,code==='zero_qty'||code==='no_price'?'line-1':null))).toBeTruthy();
  });

  it('a line blocker jumps to its line',()=>{
    expect(blockerTarget(blocker('zero_qty','q-1'))).toEqual({kind:'line',lineId:'q-1',field:'qty'});
    expect(blockerTarget(blocker('no_price','q-2'))).toEqual({kind:'line',lineId:'q-2',field:'price'});
  });

  it('a quote-level blocker opens Quote details at its section',()=>{
    expect(blockerTarget(blocker('no_ship_to'))).toEqual({kind:'details',section:'fulfillment'});
    expect(blockerTarget(blocker('call_for_freight'))).toEqual({kind:'details',section:'freight'});
    expect(blockerTarget(blocker('expiration_passed'))).toEqual({kind:'details',section:'terms'});
  });

  it('a quote with no lines goes to + Add item',()=>{
    expect(blockerTarget(blocker('no_lines'))).toEqual({kind:'add-item'});
  });
});

describe('blockerSummary',()=>{
  it('is null with nothing blocking',()=>{
    expect(blockerSummary([])).toBeNull();
  });

  it('names the first blocker alone',()=>{
    expect(blockerSummary([blocker('no_price','q-1','Line 1 (HCS-12-13-2G8) has no price.')])).toEqual({first:'Line 1 (HCS-12-13-2G8) has no price.',more:null});
  });

  it('adds "+N more" for the rest',()=>{
    const all=[blocker('zero_qty','q-1','Line 1 (HCS-12-13-2G8) has a quantity of 0.'),blocker('no_price','q-2'),blocker('call_for_freight')];
    expect(blockerSummary(all)).toEqual({first:'Line 1 (HCS-12-13-2G8) has a quantity of 0.',more:'+2 more'});
    expect(blockerSummary(all.slice(0,2))?.more).toBe('+1 more');
  });
});
