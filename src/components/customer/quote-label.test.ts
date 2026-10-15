import {describe,expect,it} from 'vitest';
import {quoteDate,STATUS_CHIPS} from './quote-label';

const NOW='2026-09-26T18:00:00.000Z';

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

it('has a status label for every status, labelled as in spec §3',()=>{
  expect(Object.fromEntries(Object.entries(STATUS_CHIPS).map(([status,chip])=>[status,chip.label]))).toEqual({
    ready_for_review:'Awaiting rep',sent:'Sent',accepted:'Accepted',changes_requested:'Changes requested',expired:'Expired',declined:'Declined',
  });
  expect(STATUS_CHIPS.declined.tone).toBe('closed');
});
