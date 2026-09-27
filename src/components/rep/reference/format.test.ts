import {describe,expect,it} from 'vitest';
import {count,day,fulfillment,money,percent,revision,taxStatus} from './format';

describe('reference page formats (task 3.8)',()=>{
  it('formats money, days in UTC with the year, and percentages',()=>{
    expect(money(18420)).toBe('$18,420.00');
    expect(money(null)).toBe('—');
    expect(day('2026-09-09')).toBe('Sep 9, 2026');
    expect(day('2025-12-31T23:30:00.000Z')).toBe('Dec 31, 2025');
    expect(percent(17/24)).toBe('71%');
    expect(percent(0.3684)).toBe('37%');
  });

  it('words counts, fulfillment, revisions and tax status',()=>{
    expect(count(1,'order')).toBe('1 order');
    expect(count(23,'order')).toBe('23 orders');
    expect(count(0,'quote')).toBe('0 quotes');
    expect(fulfillment('will_call','SLC')).toBe('Will call · SLC');
    expect(fulfillment('delivery','Provo')).toBe('Delivery · Provo');
    expect(revision(0)).toBe('Not sent');
    expect(revision(2)).toBe('rev 2');
    expect(taxStatus('taxable','UT')).toBe('Taxable (UT)');
    expect(taxStatus('exempt',null)).toBe('Exempt');
    expect(taxStatus(null,null)).toBeNull();
  });
});
