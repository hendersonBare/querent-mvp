import {expect,it} from 'vitest';
import {addDays,addMonths,at,defaultSeedAnchor,longDate,nextWeekday,seedAnchorFromEnv,shortDate} from './dates';

it('does day arithmetic across month and year ends',()=>{
  expect(addDays('2026-09-23',-42)).toBe('2026-08-12');
  expect(addDays('2026-09-23',99)).toBe('2026-12-31');
  expect(addDays('2026-09-23',-265)).toBe('2026-01-01');
  expect(at('2026-09-23',0,'16:14')).toBe('2026-09-23T16:14:00.000Z');
});

it('does calendar-month arithmetic, clamping to the end of a shorter month',()=>{
  expect(addMonths('2026-09-23',-12)).toBe('2025-09-23');
  expect(addMonths('2028-03-01',-12)).toBe('2027-03-01'); // 365 days back would be 2027-03-02
  expect(addMonths('2028-02-29',-12)).toBe('2027-02-28');
  expect(addMonths('2027-02-28',-12)).toBe('2026-02-28');
  expect(addMonths('2026-03-31',-1)).toBe('2026-02-28');
  expect(addMonths('2026-01-15',-13)).toBe('2024-12-15');
  expect(addMonths('2026-12-31',2)).toBe('2027-02-28');
});

it('finds the next weekday strictly after a day',()=>{
  expect(nextWeekday('2026-09-23',4)).toBe('2026-09-24'); // Wed -> Thu
  expect(nextWeekday('2026-09-24',4)).toBe('2026-10-01'); // Thu -> next Thu
});

it('formats dates the way the quote explains them',()=>{
  expect(shortDate('2026-08-12')).toBe('Aug 12');
  expect(longDate('2026-12-31')).toBe('Dec 31, 2026');
});

it('anchors to yesterday (UTC) unless QUERENT_SEED_DATE is set',()=>{
  const now=new Date('2026-10-05T01:30:00Z');
  expect(defaultSeedAnchor(now)).toBe('2026-10-04');
  expect(seedAnchorFromEnv({},now)).toBe('2026-10-04');
  expect(seedAnchorFromEnv({QUERENT_SEED_DATE:' '},now)).toBe('2026-10-04');
  expect(seedAnchorFromEnv({QUERENT_SEED_DATE:'2026-09-23'},now)).toBe('2026-09-23');
});

it('rejects a malformed QUERENT_SEED_DATE',()=>{
  for(const bad of ['Sep 23','2026-9-23','2026-02-30'])expect(()=>seedAnchorFromEnv({QUERENT_SEED_DATE:bad})).toThrow(/QUERENT_SEED_DATE/);
});
