import {expect,it} from 'vitest';
import {orderDate,timeAgo} from './time-ago';

// When a notification happened, as the bell says it (C_CVL4: "Just now", "2 h ago", "Yesterday"), and
// the Orders sheet's date (C_CVL2: "Sep 25, 2026"). Days are UTC, like every date in the app.

const NOW='2026-09-23T18:00:00.000Z';

it('says Just now, then minutes, then hours, then Yesterday, then the day',()=>{
  expect(timeAgo('2026-09-23T17:59:30.000Z',NOW)).toBe('Just now');
  expect(timeAgo('2026-09-23T18:00:05.000Z',NOW)).toBe('Just now');
  expect(timeAgo('2026-09-23T17:55:00.000Z',NOW)).toBe('5 min ago');
  expect(timeAgo('2026-09-23T16:00:00.000Z',NOW)).toBe('2 h ago');
  expect(timeAgo('2026-09-23T00:30:00.000Z',NOW)).toBe('17 h ago');
  expect(timeAgo('2026-09-22T23:00:00.000Z','2026-09-23T01:00:00.000Z')).toBe('2 h ago');
  expect(timeAgo('2026-09-22T10:00:00.000Z',NOW)).toBe('Yesterday');
  expect(timeAgo('2026-09-18T10:00:00.000Z',NOW)).toBe('Sep 18');
  expect(timeAgo('2025-12-30T10:00:00.000Z',NOW)).toBe('Dec 30, 2025');
});

it('reads a day-only time (an order ship date) as a day',()=>{
  expect(timeAgo('2026-09-23T00:00:00.000Z',NOW,{dayOnly:true})).toBe('Today');
  expect(timeAgo('2026-09-22T00:00:00.000Z',NOW,{dayOnly:true})).toBe('Yesterday');
  expect(timeAgo('2026-09-10T00:00:00.000Z',NOW,{dayOnly:true})).toBe('Sep 10');
});

it('writes an order date with its year',()=>{
  expect(orderDate('2026-09-09')).toBe('Sep 9, 2026');
  expect(orderDate('2025-12-18')).toBe('Dec 18, 2025');
});
