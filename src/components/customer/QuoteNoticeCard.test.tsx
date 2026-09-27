import {fireEvent,render,screen,within} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import type {QuoteNotice} from '@/domain';
import {onOpenQuote} from './open-quote';
import {QuoteNoticeCard} from './QuoteNoticeCard';

// "Quote … is ready" in the chat (spec §3, task 5.1): headline, the rep's plain text, View quote.

const notice=(text:string,extra:Partial<QuoteNotice>={}):QuoteNotice=>({id:'m-1',conversation_id:'c-1',created_at:'2026-09-23T17:00:00.000Z',text,quote_id:'q-24817',quote_number:'Q-24817',
  revision:1,total:1122.4,valid_until:'2026-10-07',headline:'Quote Q-24817 is ready: $1,122.40, valid until Oct 7',attach_pdf:true,pdf_url:'/api/quotes/q-24817/pdf?variant=customer&rev=1',...extra});

it('shows the headline, then the rep’s message with its line breaks, then View quote',()=>{
  render(<QuoteNoticeCard notice={notice('Hi Dana, your quote is ready.\n\nThanks, Brandi')}/>);
  const card=screen.getByRole('article',{name:'Quote Q-24817 is ready: $1,122.40, valid until Oct 7'});
  const text=card.querySelector('.qn-text')!;
  expect(text.textContent).toBe('Hi Dana, your quote is ready.\n\nThanks, Brandi');
  const parts=[card.querySelector('.qn-headline'),text,within(card).getByRole('button',{name:'View quote'})];
  for(let i=1;i<parts.length;i++)expect(parts[i-1]!.compareDocumentPosition(parts[i]!)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

it('renders the rep’s message as plain text: HTML and Markdown show as typed, never as markup',()=>{
  const typed='<b>bold</b> <img src=x onerror="window.__pwned=1"> <script>window.__pwned=2</script>\n**stars** _under_ [link](javascript:alert(1)) # Heading\n- item';
  render(<QuoteNoticeCard notice={notice(typed)}/>);
  const card=screen.getByRole('article');
  expect(card.querySelector('.qn-text')!.textContent).toBe(typed);
  for(const tag of ['b','img','script','strong','em','a','h1','ul','li','code'])expect(card.querySelector(`.qn-text ${tag}`),tag).toBeNull();
  expect(within(card).queryByRole('link')).toBeNull();
  expect((window as unknown as {__pwned?:number}).__pwned).toBeUndefined();
});

it('leaves out an empty message: the headline and View quote still show',()=>{
  render(<QuoteNoticeCard notice={notice('')}/>);
  const card=screen.getByRole('article');
  expect(card.querySelector('.qn-text')).toBeNull();
  expect(within(card).getByRole('button',{name:'View quote'})).toBeInTheDocument();
});

it('View quote opens the PDF preview on the revision the message announced',()=>{
  const opened=vi.fn();
  const stop=onOpenQuote(opened);
  try{
    render(<QuoteNoticeCard notice={notice('Rev 2',{revision:2,headline:'Quote Q-24817 is ready: $1,000.00, valid until Oct 8'})}/>);
    fireEvent.click(screen.getByRole('button',{name:'View quote'}));
  }finally{stop();}
  expect(opened).toHaveBeenCalledWith({id:'q-24817',quote_number:'Q-24817',revision:2});
});
