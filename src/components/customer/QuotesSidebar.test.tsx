import {fireEvent,render,screen,within} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {OPEN_QUOTE_EVENT} from './open-quote';
import {QuotesSidebar} from './QuotesSidebar';
import {fakeApi,NOW,quotes} from './test-fixtures';

it('shows one button per quote, newest first, labelled "Quote · date · $total" with a status chip',async()=>{
  render(<QuotesSidebar api={fakeApi({'customer/quotes':quotes})} now={NOW}/>);
  const list=await screen.findByRole('list',{name:'Your quotes'});
  const buttons=within(list).getAllByRole('button');
  expect(buttons.map(b=>b.querySelector('.cx-quote-label')?.textContent)).toEqual([
    'Quote · Sep 23 · Awaiting rep',
    'Quote · Sep 21 · $1,109.50',
    'Quote · Sep 15 · $322.80',
    'Quote · Sep 7 · $655.25',
    'Quote · Sep 28, 2025 · $411.70',
  ]);
  expect(buttons.map(b=>b.querySelector('.cx-chip')?.textContent)).toEqual(['Awaiting rep','Sent','Changes requested','Accepted','Expired']);
  expect(buttons[0]).toHaveTextContent('Q-24817');
  expect(buttons[1].querySelector('.cx-chip')).toHaveClass('cx-chip-action');
  expect(screen.getByText('5',{selector:'.count-badge'})).toBeInTheDocument();
});

it('emits "open quote" with the quote when a button is clicked (the modal is task 5.1)',async()=>{
  const opened=vi.fn();
  const listener=(event:Event)=>opened((event as CustomEvent).detail);
  window.addEventListener(OPEN_QUOTE_EVENT,listener);
  try{
    render(<QuotesSidebar api={fakeApi({'customer/quotes':quotes})} now={NOW}/>);
    fireEvent.click(await screen.findByRole('button',{name:/Quote · Sep 7 · \$655\.25/}));
    expect(opened).toHaveBeenCalledWith({id:'q-24816',quote_number:'Q-24816'});
  }finally{window.removeEventListener(OPEN_QUOTE_EVENT,listener);}
});

it('explains where quotes will appear when there are none',async()=>{
  render(<QuotesSidebar api={fakeApi({'customer/quotes':[]})} now={NOW}/>);
  expect(await screen.findByText(/No quotes yet/)).toBeInTheDocument();
  expect(screen.queryByRole('list',{name:'Your quotes'})).not.toBeInTheDocument();
});

it('shows a loading state, then an error',async()=>{
  render(<QuotesSidebar api={fakeApi({'customer/quotes':()=>{throw new Error('Unable to load your quotes.');}})} now={NOW}/>);
  expect(screen.getByRole('status')).toHaveTextContent('Loading quotes…');
  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load your quotes.');
  expect(screen.queryByText('Loading quotes…')).not.toBeInTheDocument();
});
