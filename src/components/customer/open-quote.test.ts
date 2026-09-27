import {expect,it,vi} from 'vitest';
import {emitOpenQuote,OPEN_QUOTE_EVENT,onOpenQuote} from './open-quote';

// The "open quote" event (task 2.4): the right sidebar and the chat's View quote emit it; the PDF
// preview modal (task 5.1) subscribes.

it('carries the revision a chat message announced (task 5.1)',()=>{
  const handler=vi.fn();
  const stop=onOpenQuote(handler);
  try{emitOpenQuote({id:'q-24817',quote_number:'Q-24817',revision:2});}finally{stop();}
  expect(handler).toHaveBeenCalledWith({id:'q-24817',quote_number:'Q-24817',revision:2});
});

it('dispatches a window event naming the quote',()=>{
  const seen=vi.fn();
  const listener=(event:Event)=>seen((event as CustomEvent).detail);
  window.addEventListener(OPEN_QUOTE_EVENT,listener);
  try{
    emitOpenQuote({id:'q-24817',quote_number:'Q-24817'});
    expect(OPEN_QUOTE_EVENT).toBe('querent:open-quote');
    expect(seen).toHaveBeenCalledWith({id:'q-24817',quote_number:'Q-24817'});
  }finally{window.removeEventListener(OPEN_QUOTE_EVENT,listener);}
});

it('lets a subscriber listen and stop listening',()=>{
  const handler=vi.fn();
  const stop=onOpenQuote(handler);
  emitOpenQuote({id:'q-24816',quote_number:'Q-24816'});
  stop();
  emitOpenQuote({id:'q-24815',quote_number:'Q-24815'});
  expect(handler).toHaveBeenCalledTimes(1);
  expect(handler).toHaveBeenCalledWith({id:'q-24816',quote_number:'Q-24816'});
});
