import {describe,expect,it} from 'vitest';
import {acceptQuestion,actionNote,awaitingCopy,canRespond,changesQuestion,isOlderRevision,lockedSummary,previewFacts,repFirstName} from './copy';
import {NOW,previews} from './test-fixtures';

// The PDF preview modal's words per quote state (task 5.1).

describe('previewFacts',()=>{
  it('a sent revision: its total, valid-until day and which revision it is',()=>{
    expect(previewFacts(previews.sent,NOW)).toEqual([{label:'Total',value:'$1,122.40'},{label:'Valid until',value:'Oct 7'},{label:'Revision',value:'1 of 1'}]);
    expect(previewFacts(previews.older,NOW).at(-1)).toEqual({label:'Revision',value:'1 of 2'});
  });
  it('before the first send: only when it was requested (no total exists yet)',()=>{
    expect(previewFacts(previews.awaiting,NOW)).toEqual([{label:'Requested',value:'Sep 23'}]);
  });
  it('names the year of a valid-until day in another year',()=>{
    expect(previewFacts({...previews.sent,shown:{...previews.sent.shown,valid_until:'2027-01-04'}},NOW)[1]).toEqual({label:'Valid until',value:'Jan 4, 2027'});
  });
});

describe('actionNote: how to answer, what was answered, or why Accept and Request changes are off (task 5.2)',()=>{
  it.each([
    ['awaiting','You can accept it or ask for changes once Brandi sends it.'],
    ['sent','Accept it with a pickup time and your PO, or ask Brandi for changes.'],
    ['delivery','Accept it with a delivery time and your PO, or ask Brandi for changes.'],
    ['expired','This quote expired: it was valid until Oct 7. Ask Brandi for a new one.'],
    ['accepted','You accepted rev 1 with PO 7781: pickup Tue Sep 29, 10:00 AM at SLC.'],
    ['changesRequested','You asked for changes to rev 1. Brandi is revising the quote.'],
    ['older','Revision 2 replaced this one.'],
    ['latest','Accept it with a pickup time and your PO, or ask Brandi for changes.'],
  ] as const)('%s',(state,note)=>{
    expect(actionNote(previews[state],NOW)).toBe(note);
  });

  it('a sent quote still open in the modal past valid-until reads expired',()=>{
    expect(actionNote(previews.sent,'2026-10-08T00:00:00.000Z')).toBe('This quote expired: it was valid until Oct 7. Ask Brandi for a new one.');
  });

  it('an accepted quote from before 5.2 (no answer on file) still says so',()=>{
    expect(actionNote({...previews.accepted,response:null},NOW)).toBe('You accepted this quote.');
  });

  it('says "your rep" when the quote has none on file',()=>{
    expect(actionNote({...previews.awaiting,rep:null},NOW)).toBe('You can accept it or ask for changes once your rep sends it.');
    expect(awaitingCopy({...previews.awaiting,rep:null})).toEqual({title:'Your rep is pricing this quote',body:'It opens here once your rep sends it, and a message with the total arrives in your chat.'});
    expect(repFirstName({rep:null})).toBe('your rep');
  });
});

it('awaitingCopy names the rep pricing it',()=>{
  expect(awaitingCopy(previews.awaiting)).toEqual({title:'Brandi is pricing this quote',body:'It opens here once Brandi sends it, and a message with the total arrives in your chat.'});
});

it('isOlderRevision: only when a newer revision was sent',()=>{
  expect(isOlderRevision(previews.older)).toBe(true);
  expect(isOlderRevision(previews.latest)).toBe(false);
  expect(isOlderRevision(previews.awaiting)).toBe(false);
});

describe('canRespond: Accept and Request changes only on the latest sent revision, before it expires',()=>{
  it.each([
    ['sent',true],['latest',true],['delivery',true],
    ['awaiting',false],['expired',false],['accepted',false],['changesRequested',false],['older',false],['noAttachment',true],
  ] as const)('%s',(state,open)=>{
    expect(canRespond(previews[state],NOW)).toBe(open);
  });
  it('closes at the end of the valid-until day (UTC)',()=>{
    expect(canRespond(previews.sent,'2026-10-07T23:59:59.000Z')).toBe(true);
    expect(canRespond(previews.sent,'2026-10-08T00:00:00.000Z')).toBe(false);
  });
});

describe('what the Confirm dialogs repeat',()=>{
  it('Accept: the quote, revision, total, time, branch and PO (spec §3)',()=>{
    expect(acceptQuestion({quoteNumber:'Q-24817',revision:2,total:1122.4,fulfillment:'will_call',branch:'SLC',at:'2026-10-01T16:00:00.000Z',po:'7781'}))
      .toBe('Accept Q-24817 rev 2 for $1,122.40, pickup Thu Oct 1, 10:00 AM at SLC, PO 7781?');
    expect(acceptQuestion({quoteNumber:'Q-24820',revision:1,total:80,fulfillment:'delivery',branch:'Ogden',at:'2026-11-02T21:30:00.000Z',po:'A-1'}))
      .toBe('Accept Q-24820 rev 1 for $80.00, delivery Mon Nov 2, 2:30 PM from Ogden, PO A-1?');
  });
  it('Request changes: the quote, revision and rep',()=>{
    expect(changesQuestion(previews.sent)).toBe('Send your change request for Q-24817 rev 1 to Brandi?');
  });
  it('the locked branch and pickup or delivery',()=>{
    expect(lockedSummary(previews.sent.shown)).toBe('Pickup at SLC');
    expect(lockedSummary(previews.delivery.shown)).toBe('Delivery from SLC to 1800 W 10950 S, South Jordan, UT 84095');
  });
});
