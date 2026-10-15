import type {AnchorHTMLAttributes,ReactNode} from 'react';
import {fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {EXAMPLE_ID,LINE_IDS,QUOTE_ID,quote} from './test-fixtures';

// /quotes/[id] (docs/boxt/plan.md B6): the header, the matched lines (item with the customer's original
// text under it, SKU, qty, unit price, line total, "Matched by rep"), the unmatched lines with their
// original text and stored near-misses, the total; edit (customer, reference, qty, unit price, remove)
// with Save disabled while anything is invalid; delete behind a confirm dialog; the example read-only.

const router=vi.hoisted(()=>({push:vi.fn(),refresh:vi.fn()}));
vi.mock('next/navigation',()=>({useRouter:()=>router}));
vi.mock('next/link',()=>({default:({href,children,...rest}:AnchorHTMLAttributes<HTMLAnchorElement>&{href:string;children?:ReactNode})=><a href={href} {...rest}>{children}</a>}));

const {QuoteDetail}=await import('./QuoteDetail');

const fetchMock=vi.fn<typeof fetch>();
const reply=(status:number,body:unknown)=>Promise.resolve(new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}}));
beforeEach(()=>{
  fetchMock.mockReset();
  router.push.mockReset();
  router.refresh.mockReset();
  vi.stubGlobal('fetch',fetchMock);
});
afterEach(()=>vi.unstubAllGlobals());

const [A,B,C,U]=LINE_IDS;
const matchedTable=()=>screen.getByRole('table',{name:'Items'});
const rowOf=(sku:string)=>within(matchedTable()).getAllByRole('row').find(r=>within(r).queryByText(sku))!;
const save=()=>screen.getByRole('button',{name:'Save changes'});

describe('reading a quote',()=>{
  it('shows the customer, reference, who created it and when',()=>{
    render(<QuoteDetail initial={quote()}/>);
    expect(screen.getByRole('heading',{level:1,name:'Acme Fulfilment'})).toBeInTheDocument();
    expect(screen.getByText('PO-7781')).toBeInTheDocument();
    expect(screen.getByText('rep@boxt.test')).toBeInTheDocument();
    expect(screen.getByText(/Oct 15, 2026/)).toBeInTheDocument();
    expect(screen.getByRole('link',{name:/Quotes/})).toHaveAttribute('href','/quotes');
  });

  it('lists the matched lines: item, SKU, qty, unit price and line total, with the original text under the item',()=>{
    render(<QuoteDetail initial={quote()}/>);
    expect(within(matchedTable()).getAllByRole('columnheader').map(h=>h.textContent)).toEqual(['Item','SKU','Qty','Unit price','Line total']);
    const rows=within(matchedTable()).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);
    const mailers=rowOf('M1044');
    expect(within(mailers).getByText('White Corrugated Mailers 10x4x4"')).toBeInTheDocument();
    expect(within(mailers).getByText('200 white mailer boxes 10x4x4')).toBeInTheDocument();
    expect(within(mailers).getByText('200')).toBeInTheDocument();
    expect(within(mailers).getByText('$0.375')).toBeInTheDocument();
    expect(within(mailers).getByText('$75.00')).toBeInTheDocument();
    expect(within(rowOf('12108-BDL')).getByText('$1,575.00')).toBeInTheDocument();
    expect(within(rowOf('B855SS')).getByText('$125.98')).toBeInTheDocument();
  });

  it('shows each line\'s quantity and unit price in its unit ("1,500 each", "$1.05 per each", "4 cases")',()=>{
    render(<QuoteDetail initial={quote()}/>);
    const cells=(sku:string)=>within(rowOf(sku)).getAllByRole('cell').map(c=>c.textContent?.replace(/\s+/g,' ').trim());
    expect(cells('12108-BDL').slice(2)).toEqual(['1,500 each','$1.05 per each','$1,575.00']);
    expect(cells('M1044').slice(2)).toEqual(['200 each','$0.375 per each','$75.00']);
    expect(cells('B855SS').slice(2)).toEqual(['4 cases','$31.495 per case','$125.98']);
  });

  it('shows a line saved without a unit as a bare quantity and price',()=>{
    const q=quote();
    render(<QuoteDetail initial={{...q,lines:[{...q.lines[0],unit:null}]}}/>);
    expect(within(rowOf('12108-BDL')).getAllByRole('cell').map(c=>c.textContent?.trim()).slice(2,4)).toEqual(['1,500','$1.05']);
  });

  it('tags only the lines the rep matched',()=>{
    render(<QuoteDetail initial={quote()}/>);
    expect(within(rowOf('B855SS')).getByText('Matched by rep')).toBeInTheDocument();
    expect(within(rowOf('M1044')).queryByText('Matched by rep')).toBeNull();
    expect(screen.getAllByText('Matched by rep')).toHaveLength(1);
  });

  it('lists the unmatched lines with their original text, qty and the stored near-misses',()=>{
    render(<QuoteDetail initial={quote()}/>);
    const section=screen.getByRole('region',{name:/Unmatched lines/});
    expect(within(section).getByText('Unmatched - original text')).toBeInTheDocument();
    expect(within(section).getByText('250 boxes 12 x 10 x 8 double wall, 48 ECT')).toBeInTheDocument();
    expect(within(section).getByText('Qty 250 each',{selector:'[data-qty]'})).toBeInTheDocument();
    const near=within(section).getByRole('table',{name:/Closest items/});
    expect(within(near).getAllByRole('columnheader').map(h=>h.textContent)).toEqual(['Item','SKU','Similarity']);
    const cells=within(near).getAllByRole('row').slice(1).map(r=>within(r).getAllByRole('cell').map(c=>c.textContent));
    expect(cells).toEqual([
      ['12 x 10 x 8" Corrugated Boxes, bundle pricing','12108-BDL','58%'],
      ['12 x 10 x 8" Corrugated Boxes, pallet pricing','12108-PLT','57%'],
    ]);
    expect(section).not.toHaveTextContent(/match\b/i);
    // Read-only: nothing to pick.
    expect(within(section).queryByRole('button')).toBeNull();
  });

  it('shows the total',()=>{
    render(<QuoteDetail initial={quote()}/>);
    expect(screen.getByTestId('quote-total')).toHaveTextContent('$1,775.98');
  });

  it('shows "Not set" (muted) for an empty reference, and no unmatched section when every line matched',()=>{
    const q=quote({customerName:'',reference:''});
    render(<QuoteDetail initial={{...q,lines:q.lines.filter(l=>!l.unmatched)}}/>);
    expect(screen.getByRole('heading',{level:1}).textContent).toBe('No customer name');
    expect(screen.getByText('Not set')).toBeInTheDocument();
    expect(screen.queryByText('None')).toBeNull();
    expect(screen.queryByRole('region',{name:/Unmatched lines/})).toBeNull();
  });
});

describe('the example quote',()=>{
  it('is tagged Example, says it cannot be edited or deleted, and offers neither',()=>{
    render(<QuoteDetail initial={quote({id:EXAMPLE_ID,isExample:true,customerName:'Example customer',createdByEmail:null})}/>);
    expect(screen.getByText('Example',{selector:'h1 ~ *'})).toBeInTheDocument();
    // Created by "Example", not "None".
    expect(screen.getByText('Created by').nextElementSibling?.textContent).toBe('Example');
    expect(screen.getByText('This example can\'t be edited or deleted.')).toBeInTheDocument();
    expect(screen.queryByRole('button',{name:/Edit/})).toBeNull();
    expect(screen.queryByRole('button',{name:/Delete/})).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});

describe('editing',()=>{
  const startEditing=()=>{render(<QuoteDetail initial={quote()}/>);fireEvent.click(screen.getByRole('button',{name:'Edit quote'}));};
  const qty=(sku:string)=>within(rowOf(sku)).getByRole('textbox',{name:/Quantity/});
  const price=(sku:string)=>within(rowOf(sku)).getByRole('textbox',{name:/Unit price/});

  it('turns the customer, reference, quantities and prices into inputs',()=>{
    startEditing();
    expect(screen.getByRole('textbox',{name:'Customer'})).toHaveValue('Acme Fulfilment');
    expect(screen.getByRole('textbox',{name:'Reference'})).toHaveValue('PO-7781');
    expect(qty('M1044')).toHaveValue('200');
    expect(price('M1044')).toHaveValue('0.375');
    // The units stay beside the inputs.
    expect(within(rowOf('M1044')).getByText('each')).toBeInTheDocument();
    expect(within(rowOf('M1044')).getByText('per each')).toBeInTheDocument();
    expect(within(rowOf('B855SS')).getByText('cases')).toBeInTheDocument();
    expect(within(rowOf('B855SS')).getByText('per case')).toBeInTheDocument();
    expect(save()).toBeEnabled();
    expect(screen.queryByRole('button',{name:/Delete quote/})).toBeNull();
  });

  it.each([
    ['an empty price','price',''],
    ['a price with 5 decimals','price','1.23456'],
    ['a negative price','price','-1'],
    ['an empty quantity','qty',''],
    ['a quantity of 0','qty','0'],
    ['a quantity that is not a number','qty','ten'],
    ['a quantity with 4 decimals','qty','1.2345'],
    ['a quantity that rounds to 0','qty','0.0001'],
  ])('disables Save for %s and says what is wrong',(_label,field,value)=>{
    startEditing();
    const input=field==='price'?price('M1044'):qty('M1044');
    fireEvent.change(input,{target:{value}});
    expect(save()).toBeDisabled();
    expect(input).toHaveAttribute('aria-invalid','true');
    expect(input).toHaveAccessibleDescription(/\S/);
    fireEvent.change(input,{target:{value:field==='price'?'0':'2.5'}});
    expect(save()).toBeEnabled();
  });

  it('says a quantity takes up to 3 decimals',()=>{
    startEditing();
    fireEvent.change(qty('M1044'),{target:{value:'1.2345'}});
    expect(qty('M1044')).toHaveAccessibleDescription('Use up to 3 decimals.');
    expect(save()).toBeDisabled();
  });

  it('updates line totals and the total as the user types',()=>{
    startEditing();
    fireEvent.change(price('M1044'),{target:{value:'0.5'}});
    expect(within(rowOf('M1044')).getByText('$100.00')).toBeInTheDocument();
    expect(screen.getByTestId('quote-total')).toHaveTextContent('$1,800.98');
  });

  it('removes a line, and disables Save once no line is left',()=>{
    startEditing();
    fireEvent.click(within(rowOf('M1044')).getByRole('button',{name:/Remove/}));
    expect(within(matchedTable()).queryByText('M1044')).toBeNull();
    for(const sku of ['12108-BDL','B855SS'])fireEvent.click(within(rowOf(sku)).getByRole('button',{name:/Remove/}));
    expect(save()).toBeEnabled();
    fireEvent.click(within(screen.getByRole('region',{name:/Unmatched lines/})).getByRole('button',{name:/Remove/}));
    expect(save()).toBeDisabled();
    expect(screen.getByText(/at least one line/i)).toBeInTheDocument();
  });

  it('saves with PATCH and shows the saved quote',async()=>{
    const saved=quote({customerName:'Acme Ltd',lines:quote().lines.filter(l=>l.id!==A).map(l=>l.id===B?{...l,quantity:250,unitPrice:0.4}:l),total:225.98});
    fetchMock.mockReturnValueOnce(reply(200,{quote:saved}));
    startEditing();
    fireEvent.change(screen.getByRole('textbox',{name:'Customer'}),{target:{value:'Acme Ltd'}});
    fireEvent.click(within(rowOf('12108-BDL')).getByRole('button',{name:/Remove/}));
    fireEvent.change(qty('M1044'),{target:{value:'250'}});
    fireEvent.change(price('M1044'),{target:{value:'0.40'}});
    fireEvent.click(save());
    await waitFor(()=>expect(screen.queryByRole('button',{name:'Save changes'})).toBeNull());
    const [url,init]=fetchMock.mock.calls[0];
    expect(url).toBe(`/api/quotes/${QUOTE_ID}`);
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(String(init?.body))).toEqual({customerName:'Acme Ltd',reference:'PO-7781',lines:[{id:B,quantity:250,unitPrice:0.4},{id:C,quantity:4,unitPrice:31.495},{id:U}]});
    expect(screen.getByRole('heading',{level:1,name:'Acme Ltd'})).toBeInTheDocument();
    expect(screen.getByTestId('quote-total')).toHaveTextContent('$225.98');
    expect(router.refresh).toHaveBeenCalled();
  });

  it('shows the server\'s refusal and stays in edit mode',async()=>{
    fetchMock.mockReturnValueOnce(reply(400,{error:'Every matched line needs a quantity and a unit price.'}));
    startEditing();
    fireEvent.click(save());
    expect(await screen.findByRole('alert')).toHaveTextContent('Every matched line needs a quantity and a unit price.');
    expect(save()).toBeEnabled();
  });

  it('Cancel drops the changes',()=>{
    startEditing();
    fireEvent.change(price('M1044'),{target:{value:'9'}});
    fireEvent.click(screen.getByRole('button',{name:'Cancel'}));
    expect(within(rowOf('M1044')).getByText('$0.375')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('deleting',()=>{
  it('asks first in a dialog; Cancel keeps the quote',()=>{
    render(<QuoteDetail initial={quote()}/>);
    fireEvent.click(screen.getByRole('button',{name:'Delete'}));
    const dialog=screen.getByRole('alertdialog',{name:/Delete this quote\?/});
    fireEvent.click(within(dialog).getByRole('button',{name:'Cancel'}));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('deletes with DELETE, then goes back to /quotes',async()=>{
    fetchMock.mockReturnValueOnce(reply(200,{ok:true}));
    render(<QuoteDetail initial={quote()}/>);
    fireEvent.click(screen.getByRole('button',{name:'Delete'}));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button',{name:'Delete quote'}));
    await waitFor(()=>expect(router.push).toHaveBeenCalledWith('/quotes'));
    expect(fetchMock).toHaveBeenCalledWith(`/api/quotes/${QUOTE_ID}`,expect.objectContaining({method:'DELETE'}));
  });

  it('shows the refusal in the dialog when the delete fails',async()=>{
    fetchMock.mockReturnValueOnce(reply(409,{error:'The example quote can\'t be deleted.'}));
    render(<QuoteDetail initial={quote()}/>);
    fireEvent.click(screen.getByRole('button',{name:'Delete'}));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button',{name:'Delete quote'}));
    expect(await within(screen.getByRole('alertdialog')).findByRole('alert')).toHaveTextContent('The example quote can\'t be deleted.');
    expect(router.push).not.toHaveBeenCalled();
  });

  it('Escape closes the dialog',()=>{
    render(<QuoteDetail initial={quote()}/>);
    fireEvent.click(screen.getByRole('button',{name:'Delete'}));
    fireEvent.keyDown(screen.getByRole('alertdialog'),{key:'Escape'});
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});

it('never prints an em dash',()=>{
  const {container}=render(<QuoteDetail initial={quote()}/>);
  expect(container.textContent).not.toContain('\u2014');
});
