import type {Fulfillment,QuoteReadyPayload} from '@/domain';

// The "quote is ready" message Approve & send posts in the customer's Querent chat (spec §3, task
// 3.7). Pure and client-safe: sendQuote builds the stored message with it, and the send dialog
// shows the same headline and starts from the same message.
//
// The message is plain text. The rep types it in the send dialog; it is stored as they typed it
// minus what can't be shown safely as text (control characters, invisible and direction-changing
// characters) and extra whitespace. Nothing is escaped or stripped as markup: whoever renders it
// shows it as text (React escapes it), never as Markdown or HTML.

/** The longest message a rep can send with a quote, once sanitized. The send dialog's textarea stops here too. */
export const QUOTE_MESSAGE_MAX=2000;

const usd=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'});
const monthDay=new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',timeZone:'UTC'});
const monthDayYear=new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
const weekdayMonthDay=new Intl.DateTimeFormat('en-US',{weekday:'short',month:'short',day:'numeric',timeZone:'UTC'});
const asDay=(day:string)=>new Date(`${day}T00:00:00.000Z`);

/** "Oct 7", or "Jan 13, 2027" when the day falls in another year than `sentAt`. Days are UTC, like valid_until. */
function validDay(validUntil:string,sentAt:string){
  const date=asDay(validUntil);
  return (date.getUTCFullYear()===new Date(sentAt).getUTCFullYear()?monthDay:monthDayYear).format(date);
}

export interface HeadlineInput {quoteNumber:string;total:number;validUntil:string;
  /** When it is sent (ISO): decides whether the valid-until day needs its year. */
  sentAt:string}

/** "Quote Q-24817 is ready: $1,122.40, valid until Oct 7": spec §3's chat line, before its "— View quote" link. */
export function quoteReadyHeadline({quoteNumber,total,validUntil,sentAt}:HeadlineInput){
  return `Quote ${quoteNumber} is ready: ${usd.format(total)}, valid until ${validDay(validUntil,sentAt)}`;
}

/** C0 and C1 control characters except the line feed (tabs and other breaks are converted first). */
const CONTROL=/[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/g;
/** Invisible and direction-changing characters: zero-width, bidi marks, embeddings, overrides and isolates, word joiners, the BOM. */
const INVISIBLE=/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;

/**
 * The rep's message as the chat stores it: plain text. Line endings become \n and tabs spaces;
 * control characters and invisible or direction-changing characters are removed; each line loses
 * its trailing spaces, runs of blank lines collapse to one, and the ends are trimmed. Anything
 * that isn't a string is an empty message.
 */
export function sanitizeChatText(text:unknown):string{
  if(typeof text!=='string')return '';
  return text.normalize('NFC')
    .replace(/\r\n?|[\u2028\u2029]/g,'\n')
    .replace(/\t/g,' ')
    .replace(CONTROL,'')
    .replace(INVISIBLE,'')
    .split('\n').map(line=>line.trimEnd()).join('\n')
    .replace(/\n{3,}/g,'\n\n')
    .trim();
}

const quotePdf=(quoteId:string,rev:number|'draft')=>`/api/quotes/${encodeURIComponent(quoteId)}/pdf?variant=customer&rev=${rev}`;
/** The customer PDF of a sent revision (task 4.1): what the customer's preview modal shows and downloads. */
export const customerPdfUrl=(quoteId:string,revision:number)=>quotePdf(quoteId,revision);
/** The rep's preview of the unsent draft as the customer PDF, stamped "Draft preview · not sent" (task 4.1). */
export const draftPdfUrl=(quoteId:string)=>quotePdf(quoteId,'draft');

export interface QuoteReadyInput extends HeadlineInput {quoteId:string;revision:number;attachPdf:boolean}

/** The payload of the `quote_ready` chat message for a revision just sent. */
export function quoteReadyPayload({quoteId,quoteNumber,revision,total,validUntil,sentAt,attachPdf}:QuoteReadyInput):QuoteReadyPayload{
  return {quote_id:quoteId,quote_number:quoteNumber,revision,total,valid_until:validUntil,headline:quoteReadyHeadline({quoteNumber,total,validUntil,sentAt}),
    attach_pdf:attachPdf,pdf_url:customerPdfUrl(quoteId,revision)};
}

export interface SendMessageInput {
  customerFirstName:string;repFirstName:string;lineCount:number;
  /** Before tax, or null while freight is still to set (then it is left out). */
  total:number|null;
  fulfillment:Fulfillment;branchCode:string;
  /** The day the customer asked for (YYYY-MM-DD), or null. */
  requestedDate:string|null;
}

/**
 * The send dialog's starting message, in screen 07's words: "Hi Dana, your quote is ready: 4
 * items, $1,122.40 before tax, pickup at SLC on Thu, Sep 24. You can accept it or ask for changes
 * from the link. Thanks, Brandi". The link is the chat's "View quote".
 */
export function defaultSendMessage({customerFirstName,repFirstName,lineCount,total,fulfillment,branchCode,requestedDate}:SendMessageInput){
  const items=`${lineCount} ${lineCount===1?'item':'items'}`;
  const where=fulfillment==='delivery'?`delivery from ${branchCode}`:`pickup at ${branchCode}`;
  const when=requestedDate?` on ${weekdayMonthDay.format(asDay(requestedDate))}`:'';
  const what=[items,...(total===null?[]:[`${usd.format(total)} before tax`]),`${where}${when}`].join(', ');
  return `Hi ${customerFirstName}, your quote is ready: ${what}. You can accept it or ask for changes from the link. Thanks, ${repFirstName}`;
}
