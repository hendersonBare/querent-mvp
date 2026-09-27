import {describe,expect,it} from 'vitest';
import {actionNote,awaitingCopy,isOlderRevision,previewFacts,repFirstName} from './copy';
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

describe('actionNote: why Accept and Request changes are off (they arrive in task 5.2)',()=>{
  it.each([
    ['awaiting','You can accept it or ask for changes once Brandi sends it.'],
    ['sent','To accept it or ask for changes, reply to Brandi in chat.'],
    ['expired','This quote expired: it was valid until Oct 7. Ask Brandi for a new one.'],
    ['accepted','You accepted this quote.'],
    ['changesRequested','You asked for changes. Brandi is revising the quote.'],
    ['older','Revision 2 replaced this one.'],
    ['latest','To accept it or ask for changes, reply to Brandi in chat.'],
  ] as const)('%s',(state,note)=>{
    expect(actionNote(previews[state],NOW)).toBe(note);
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
