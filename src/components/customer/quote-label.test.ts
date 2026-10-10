import {describe,expect,it} from 'vitest';
import {NO_TOTAL_LABEL,quoteButtonLabel,quoteDate,STATUS_CHIPS} from './quote-label';

const NOW='2026-09-26T18:00:00.000Z';

describe('quoteButtonLabel (spec §3: "Quote · date · $total")',()=>{
  it('uses the last send date and total',()=>{
    expect(quoteButtonLabel({requested_at:'2026-09-09T15:20:00.000Z',sent_at:'2026-09-09T16:20:00.000Z',total:655.25},NOW)).toBe('Quote · Sep 9 · $655.25');
  });

  it('reads "Awaiting rep" in place of the total before the first send, dated by the request',()=>{
    expect(NO_TOTAL_LABEL).toBe('Awaiting rep');
    expect(quoteButtonLabel({requested_at:'2026-09-23T16:14:00.000Z',sent_at:null,total:null},NOW)).toBe('Quote · Sep 23 · Awaiting rep');
  });

  it('dates a later revision by its send, and formats thousands and whole dollars',()=>{
    expect(quoteButtonLabel({requested_at:'2026-09-01T15:00:00.000Z',sent_at:'2026-09-04T10:00:00.000Z',total:1234.5},NOW)).toBe('Quote · Sep 4 · $1,234.50');
    expect(quoteButtonLabel({requested_at:'2026-09-01T15:00:00.000Z',sent_at:'2026-09-01T16:00:00.000Z',total:537},NOW)).toBe('Quote · Sep 1 · $537.00');
  });
});

describe('quoteDate',()=>{
  it('uses the UTC day, like every date in the app',()=>{
    expect(quoteDate('2026-09-10T02:00:00.000Z',NOW)).toBe('Sep 10');
    expect(quoteDate('2026-09-09T23:59:00.000Z',NOW)).toBe('Sep 9');
  });

  it('adds the year outside the current one',()=>{
    expect(quoteDate('2025-09-30T16:55:00.000Z',NOW)).toBe('Sep 30, 2025');
    expect(quoteDate('2026-01-06T18:00:00.000Z','2027-01-02T00:00:00.000Z')).toBe('Jan 6, 2026');
  });
});

it('has a chip for every status, labelled as in spec §3',()=>{
  expect(Object.fromEntries(Object.entries(STATUS_CHIPS).map(([status,chip])=>[status,chip.label]))).toEqual({
    ready_for_review:'Awaiting rep',sent:'Sent',accepted:'Accepted',changes_requested:'Changes requested',expired:'Expired',declined:'Declined',
  });
  expect(STATUS_CHIPS.declined.tone).toBe('closed');
});
