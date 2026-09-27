import {describe,expect,it} from 'vitest';
import {QUOTE_MESSAGE_MAX,customerPdfUrl,defaultSendMessage,draftPdfUrl,quoteReadyHeadline,quoteReadyPayload,sanitizeChatText} from './announce';

// The "quote is ready" chat message that Approve & send posts (spec §3, task 3.7): its headline,
// the rep's message as plain text, the send dialog's starting message, and the PDF links.

describe('quoteReadyHeadline: spec §3’s line, before the chat’s “— View quote” link',()=>{
  it('names the quote, the total to the cent and the last valid day',()=>{
    expect(quoteReadyHeadline({quoteNumber:'Q-24817',total:1122.4,validUntil:'2026-10-07',sentAt:'2026-09-23T17:00:00.000Z'}))
      .toBe('Quote Q-24817 is ready: $1,122.40, valid until Oct 7');
  });

  it('adds the year when the quote runs into the next one',()=>{
    expect(quoteReadyHeadline({quoteNumber:'Q-30001',total:35,validUntil:'2027-01-13',sentAt:'2026-12-30T17:00:00.000Z'}))
      .toBe('Quote Q-30001 is ready: $35.00, valid until Jan 13, 2027');
  });
});

describe('sanitizeChatText: the rep’s message is stored as plain text',()=>{
  it('keeps ordinary text, line breaks included, exactly',()=>{
    const text='Hi Dana, your quote is ready.\nPickup Thursday at SLC.\n\nThanks, Brandi';
    expect(sanitizeChatText(text)).toBe(text);
  });

  it('keeps characters that look like markup as the words the rep typed (renderers show text, not HTML or Markdown)',()=>{
    expect(sanitizeChatText('Qty < 5 & > 2 — see **note** <b>here</b>')).toBe('Qty < 5 & > 2 — see **note** <b>here</b>');
  });

  it('normalizes line endings and tabs, and trims each line’s end and the whole message',()=>{
    expect(sanitizeChatText('  \r\nHi Dana,\t\tthanks   \r\nBrandi\r  ')).toBe('Hi Dana,  thanks\nBrandi');
    expect(sanitizeChatText('a\u2028b\u2029c')).toBe('a\nb\nc');
  });

  it('collapses runs of blank lines to one',()=>{
    expect(sanitizeChatText('Hi\n\n\n\n\nBye\n \n \nNow')).toBe('Hi\n\nBye\n\nNow');
  });

  it('drops control characters and invisible or direction-changing characters',()=>{
    expect(sanitizeChatText('Pay\u0000 now\u0007\u001b[31m')).toBe('Pay now[31m');
    expect(sanitizeChatText('abc\u202Egpj.exe\u200B\u2066x\u2069\uFEFF\u0085')).toBe('abcgpj.exex');
  });

  it('turns anything that isn’t a string into an empty message',()=>{
    for(const value of [undefined,null,42,{text:'hi'},['hi']])expect(sanitizeChatText(value)).toBe('');
    expect(sanitizeChatText(' \n\t ')).toBe('');
  });

  it('has a length limit the dialog and the server share',()=>{
    expect(QUOTE_MESSAGE_MAX).toBe(2000);
  });
});

describe('defaultSendMessage: the send dialog’s starting text (screen 07’s wording)',()=>{
  const base={customerFirstName:'Dana',repFirstName:'Brandi',lineCount:4,total:1122.4,fulfillment:'will_call' as const,branchCode:'SLC',requestedDate:'2026-09-24'};

  it('pickup: items, total before tax, where and when, and the rep’s name',()=>{
    expect(defaultSendMessage(base)).toBe('Hi Dana, your quote is ready: 4 items, $1,122.40 before tax, pickup at SLC on Thu, Sep 24. You can accept it or ask for changes from the link. Thanks, Brandi');
  });

  it('delivery, one item, no requested day',()=>{
    expect(defaultSendMessage({...base,lineCount:1,total:377.5,fulfillment:'delivery',requestedDate:null}))
      .toBe('Hi Dana, your quote is ready: 1 item, $377.50 before tax, delivery from SLC. You can accept it or ask for changes from the link. Thanks, Brandi');
  });

  it('leaves the total out while it is unknown (freight still to set)',()=>{
    expect(defaultSendMessage({...base,total:null})).toBe('Hi Dana, your quote is ready: 4 items, pickup at SLC on Thu, Sep 24. You can accept it or ask for changes from the link. Thanks, Brandi');
  });

  it('is already clean plain text',()=>{
    const text=defaultSendMessage(base);
    expect(sanitizeChatText(text)).toBe(text);
    expect(text.length).toBeLessThan(QUOTE_MESSAGE_MAX);
  });
});

describe('PDF links',()=>{
  it('the sent revision’s customer PDF, and the rep’s draft preview (task 4.1)',()=>{
    expect(customerPdfUrl('q-24817',2)).toBe('/api/quotes/q-24817/pdf?variant=customer&rev=2');
    expect(draftPdfUrl('q-24817')).toBe('/api/quotes/q-24817/pdf?variant=customer&rev=draft');
    expect(customerPdfUrl('q/../x',1)).toBe('/api/quotes/q%2F..%2Fx/pdf?variant=customer&rev=1');
  });
});

describe('quoteReadyPayload',()=>{
  it('carries what the chat and the preview modal need, and nothing else',()=>{
    const payload=quoteReadyPayload({quoteId:'q-24817',quoteNumber:'Q-24817',revision:1,total:1122.4,validUntil:'2026-10-07',sentAt:'2026-09-23T17:00:00.000Z',attachPdf:false});
    expect(payload).toEqual({quote_id:'q-24817',quote_number:'Q-24817',revision:1,total:1122.4,valid_until:'2026-10-07',
      headline:'Quote Q-24817 is ready: $1,122.40, valid until Oct 7',attach_pdf:false,pdf_url:'/api/quotes/q-24817/pdf?variant=customer&rev=1'});
  });
});
