import {describe,expect,it} from 'vitest';
import {
  branchDay,branchInstant,checkFulfillmentTime,cleanNote,cleanPo,earliestDay,fulfillmentTimeLabel,latestDay,NOTE_MAX,noteProblem,PO_MAX,poProblem,slotLabel,slotsOn,TIME_SLOTS,
} from './response-rules';

// The customer's Accept / Request changes inputs (spec §3, task 5.2). Branch times are Mountain
// time: MDT (UTC-6) until Nov 1, 2026, MST (UTC-7) after.

// Sunday Sep 27, 2026, 10:06 AM MDT.
const NOW='2026-09-27T16:06:00.000Z';
// Monday Sep 28, 2026, 2:40 PM MDT.
const MONDAY_AFTERNOON='2026-09-28T20:40:00.000Z';

describe('time slots',()=>{
  it('run every half hour from 7:00 AM to 4:00 PM',()=>{
    expect(TIME_SLOTS[0]).toBe('07:00');
    expect(TIME_SLOTS.at(-1)).toBe('16:00');
    expect(TIME_SLOTS).toHaveLength(19);
    expect(TIME_SLOTS.map(slotLabel).slice(0,3)).toEqual(['7:00 AM','7:30 AM','8:00 AM']);
    expect(slotLabel('12:00')).toBe('12:00 PM');
    expect(slotLabel('16:00')).toBe('4:00 PM');
  });
});

describe('branch days and instants (Mountain time)',()=>{
  it('reads today in Mountain time, not UTC',()=>{
    expect(branchDay(NOW)).toBe('2026-09-27');
    // 11 PM MDT on Sep 27 is already Sep 28 in UTC.
    expect(branchDay('2026-09-28T05:00:00.000Z')).toBe('2026-09-27');
  });

  it('turns a day and slot into the instant, across the DST change',()=>{
    expect(branchInstant('2026-09-29','10:00')).toBe('2026-09-29T16:00:00.000Z');
    expect(branchInstant('2026-11-02','10:00')).toBe('2026-11-02T17:00:00.000Z');
    expect(branchInstant('2027-03-15','07:00')).toBe('2027-03-15T13:00:00.000Z');
  });

  it('labels a stored time in Mountain time, and a day on its own',()=>{
    expect(fulfillmentTimeLabel('2026-09-29T16:00:00.000Z')).toBe('Tue Sep 29, 10:00 AM');
    expect(fulfillmentTimeLabel('2026-09-24')).toBe('Thu Sep 24');
  });
});

describe('which days and slots can be chosen',()=>{
  it('starts at the next weekday slot at least an hour away, and ends 60 days out',()=>{
    // Sunday: Monday is the first open day.
    expect(earliestDay(NOW)).toBe('2026-09-28');
    expect(latestDay(NOW)).toBe('2026-11-26');
    // Monday 2:40 PM: 4:00 PM is still an hour away.
    expect(earliestDay(MONDAY_AFTERNOON)).toBe('2026-09-28');
    expect(slotsOn('2026-09-28',MONDAY_AFTERNOON)).toEqual(['16:00']);
    // Monday 3:10 PM: nothing left today, so Tuesday.
    expect(earliestDay('2026-09-28T21:10:00.000Z')).toBe('2026-09-29');
  });

  it('offers no slots on a weekend, a past day, a day too far out, or a day that isn’t one',()=>{
    expect(slotsOn('2026-10-03',NOW)).toEqual([]);
    expect(slotsOn('2026-09-25',NOW)).toEqual([]);
    expect(slotsOn('2026-11-27',NOW)).toEqual([]);
    expect(slotsOn('2026-02-30',NOW)).toEqual([]);
    expect(slotsOn('tomorrow',NOW)).toEqual([]);
    expect(slotsOn('2026-09-29',NOW)).toEqual(TIME_SLOTS);
  });
});

describe('checkFulfillmentTime',()=>{
  const check=(day:string,time:string,now=NOW,fulfillment:'will_call'|'delivery'='will_call')=>checkFulfillmentTime({day,time,fulfillment,now});

  it('accepts a weekday slot at least an hour ahead, as the instant to store',()=>{
    expect(check('2026-09-29','10:00')).toEqual({at:'2026-09-29T16:00:00.000Z'});
    expect(check('2026-09-28','16:00',MONDAY_AFTERNOON)).toEqual({at:'2026-09-28T22:00:00.000Z'});
    expect(check('2026-11-26','07:00')).toEqual({at:'2026-11-26T14:00:00.000Z'});
  });

  it('refuses a time in the past or less than an hour away',()=>{
    expect(check('2026-09-25','10:00')).toEqual({problem:'That day has passed. Choose Mon Sep 28 or later.'});
    expect(check('2026-09-28','15:30',MONDAY_AFTERNOON)).toEqual({problem:'Choose a pickup time at least an hour from now.'});
    expect(check('2026-09-28','08:00',MONDAY_AFTERNOON)).toEqual({problem:'Choose a pickup time at least an hour from now.'});
  });

  it('refuses weekends, days too far out, and times outside the slots',()=>{
    expect(check('2026-10-03','10:00')).toEqual({problem:'Pickup is Monday to Friday. Choose a weekday.'});
    expect(check('2026-10-04','10:00',NOW,'delivery')).toEqual({problem:'Delivery is Monday to Friday. Choose a weekday.'});
    expect(check('2026-11-27','10:00')).toEqual({problem:'Choose a day within the next 60 days.'});
    for(const time of ['06:30','16:30','10:15','22:00'])expect(check('2026-09-29',time),time).toEqual({problem:'Choose a pickup time between 7:00 AM and 4:00 PM.'});
  });

  it('refuses anything that isn’t a day and a time',()=>{
    for(const day of ['','2026-9-29','2026-02-30','Tuesday','2026-09-29T10:00'])expect(check(day,'10:00'),day).toEqual({problem:'Choose a pickup day.'});
    for(const time of ['','10','10:00:00','10am'])expect(check('2026-09-29',time),time).toEqual({problem:'Choose a pickup time.'});
    expect(check('','',NOW,'delivery')).toEqual({problem:'Choose a delivery day.'});
  });
});

describe('the PO',()=>{
  it('is one line of plain text, 1 to 40 characters',()=>{
    expect(cleanPo('  7781 ')).toBe('7781');
    expect(cleanPo('WMC\n2026\t0412')).toBe('WMC 2026 0412');
    expect(cleanPo('PO​#7781\u0007')).toBe('PO#7781');
    expect(cleanPo(42)).toBe('');
    expect(poProblem('7781')).toBeNull();
    expect(poProblem('')).toBe('Enter your PO number.');
    expect(poProblem('x'.repeat(PO_MAX))).toBeNull();
    expect(poProblem('x'.repeat(PO_MAX+1))).toBe('Keep the PO number to 40 characters.');
  });
});

describe('the change request note',()=>{
  it('is required plain text, kept as typed, up to 1,000 characters',()=>{
    expect(cleanNote('  Make the gloves 6 cases.\r\n\r\n\r\nThanks  ')).toBe('Make the gloves 6 cases.\n\nThanks');
    expect(cleanNote('<b>hi</b>')).toBe('<b>hi</b>');
    expect(cleanNote(null)).toBe('');
    expect(noteProblem('')).toBe('Say what should change: a note is required.');
    expect(noteProblem('   ')).toBe('Say what should change: a note is required.');
    expect(noteProblem('x'.repeat(NOTE_MAX))).toBeNull();
    expect(noteProblem('x'.repeat(NOTE_MAX+1))).toBe('Keep the note to 1,000 characters.');
  });
});
