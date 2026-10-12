import type {AnchorHTMLAttributes,ReactNode} from 'react';
import {act,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {BOLTS,BOLTS_VIEW,ITEM_LIST,STRAPS,TARGETS} from '../reference/test-fixtures';

// Stock (was Items, decision 46) and the item page, with Add to quote (plan U5; C_STBase, C_ST1, C_ST2,
// C_ST3). Add to quote adds the item to one of the rep's own drafts through the existing add-line route
// (POST /api/rep/quotes/<number>/lines), which prices it: pricing is untouched (Appendix F).

const router=vi.hoisted(()=>({push:vi.fn(),replace:vi.fn(),refresh:vi.fn()}));
vi.mock('next/link',()=>({default:({href,children,prefetch:_p,...rest}:AnchorHTMLAttributes<HTMLAnchorElement>&{href:string;prefetch?:boolean;children?:ReactNode})=><a href={href} {...rest}>{children}</a>}));
vi.mock('next/navigation',()=>({useRouter:()=>router}));

const {StockList}=await import('./StockList');
const {ItemDetail}=await import('./ItemDetail');

const headers=()=>screen.getAllByRole('columnheader').map(h=>h.textContent);
const bodyRows=()=>screen.getAllByRole('row').slice(1);
const card=(name:string)=>screen.getByRole('region',{name});
const panel=()=>screen.getByRole('dialog',{name:'Filter stock'});
const dialog=()=>screen.getByRole('dialog',{name:'Add to quote'});
const labels=(group:HTMLElement)=>within(group).getAllByRole('checkbox').map(c=>c.closest('label')!.textContent);
const fetchMock=vi.fn();

beforeEach(()=>{router.push.mockClear();fetchMock.mockReset();vi.stubGlobal('fetch',fetchMock);});
afterEach(()=>vi.unstubAllGlobals());

describe('StockList (C_STBase)',()=>{
  it('has the search, Filter and "<n> items, stock at SLC, Ogden and Provo"; the columns; Add to quote on each row',()=>{
    render(<StockList list={ITEM_LIST} category={null} targets={TARGETS}/>);
    expect(screen.getByRole('heading',{level:1})).toHaveTextContent('Stock');
    expect(screen.getByRole('searchbox',{name:'Search SKU or item name'})).toBeInTheDocument();
    expect(screen.getByText('2 items, stock at SLC, Ogden and Provo')).toBeInTheDocument();
    expect(headers()).toEqual([':: Item',':: Category',':: List price',':: SLC',':: Ogden',':: Provo',':: Total']);
    expect(bodyRows().map(r=>within(r).getAllByRole('cell').map(c=>c.textContent))).toEqual([
      ['Hex cap screw 1/2-13 x 2 in, Grade 8, yellow zincHCS-12-13-2G8, Box of 50','Fasteners','$38.95','64','22','8','94','Add to quote'],
      ['Ratchet strap 2 in x 27 ft, 3,333 lb WLL, J-hooksRS-2-27-JH, Each','Material Handling & Tie-downs','$28.50','7','20','0','27','Add to quote'],
    ]);
    expect(screen.getByRole('link',{name:'Hex cap screw 1/2-13 x 2 in, Grade 8, yellow zinc'})).toHaveAttribute('href','/rep/stock/HCS-12-13-2G8');
    // The category dropdown is gone: Filter replaces it.
    expect(screen.queryByRole('combobox',{name:'Category'})).toBeNull();
    expect(document.body.textContent).not.toMatch(/cost|margin|\u2014|on order/i);
  });

  it('search narrows by SKU or name, and the count follows',()=>{
    render(<StockList list={ITEM_LIST} category={null} targets={TARGETS}/>);
    fireEvent.change(screen.getByRole('searchbox',{name:'Search SKU or item name'}),{target:{value:'rs-2'}});
    expect(bodyRows()).toHaveLength(1);
    expect(screen.getByText('1 item, stock at SLC, Ogden and Provo')).toBeInTheDocument();
  });

  it('filter open (C_ST1): the summary, Category with counts, In stock at, Only show and the list price range; applying narrows',()=>{
    render(<StockList list={ITEM_LIST} category={null} targets={TARGETS}/>);
    fireEvent.click(screen.getByRole('button',{name:/^Filter/}));
    const p=within(panel());
    expect(p.getByText('2 items across 2 categories.')).toBeInTheDocument();
    expect(p.getByRole('group',{name:'Category'})).toHaveTextContent('Fasteners1Material Handling & Tie-downs1');
    expect(labels(p.getByRole('group',{name:'In stock at'}))).toEqual(['SLC','Ogden','Provo']);
    expect(labels(p.getByRole('group',{name:'Only show'}))).toEqual(['Low stock','On order']);
    expect(p.getByRole('textbox',{name:'List price from'})).toHaveAttribute('placeholder','$0.00');
    expect(p.getByRole('textbox',{name:'List price to'})).toHaveAttribute('placeholder','$38.95');
    fireEvent.click(p.getByRole('checkbox',{name:'On order'}));
    fireEvent.click(p.getByRole('button',{name:'Apply filters'}));
    expect(screen.getByRole('button',{name:'Filter, 1 applied'})).toBeInTheDocument();
    expect(bodyRows()).toHaveLength(1);
    expect(screen.getByText('1 item, stock at SLC, Ogden and Provo')).toBeInTheDocument();
  });

  it('starts filtered to the category the link names (?category=, the old Items links)',()=>{
    render(<StockList list={ITEM_LIST} category="material-handling" targets={TARGETS}/>);
    expect(bodyRows()).toHaveLength(1);
    expect(screen.getByRole('button',{name:'Filter, 1 applied'})).toBeInTheDocument();
  });

  it('Add to quote on a row opens the dialog for that item',()=>{
    render(<StockList list={ITEM_LIST} category={null} targets={TARGETS}/>);
    fireEvent.click(within(bodyRows()[1]).getByRole('button',{name:'Add to quote'}));
    expect(within(dialog()).getByText('Ratchet strap 2 in x 27 ft, 3,333 lb WLL, J-hooks')).toBeInTheDocument();
  });
});

describe('Add to quote (C_ST3)',()=>{
  const open=()=>{
    render(<StockList list={{...ITEM_LIST,items:[BOLTS,STRAPS]}} category={null} targets={TARGETS}/>);
    fireEvent.click(within(bodyRows()[0]).getByRole('button',{name:'Add to quote'}));
    return within(dialog());
  };

  it('shows the item, the rep\'s own drafts with the first picked, Start a new quote, the quantity and the frame\'s note',()=>{
    const d=open();
    expect(d.getByText('Hex cap screw 1/2-13 x 2 in, Grade 8, yellow zinc')).toBeInTheDocument();
    expect(d.getByText(', Box of 50, list price $38.95, 94 in stock',{exact:false})).toHaveTextContent('HCS-12-13-2G8, Box of 50, list price $38.95, 94 in stock');
    expect(d.getByText('Which quote?')).toBeInTheDocument();
    const choices=d.getAllByRole('radio');
    expect(choices.map(c=>c.textContent)).toEqual([
      'Q-24817, Wasatch Mechanical ContractorsDraft ready, 4 lines$1,122.40','Q-24790, Wasatch Mechanical ContractorsChanges requested, 3 linesNot sent','+Start a new quote',
    ]);
    expect(choices[0]).toBeChecked();
    expect(d.getByRole('textbox',{name:'Quantity'})).toHaveValue('1');
    expect(d.getByText('The customer price applies once it is on the quote. You can change it there.')).toBeInTheDocument();
    expect(d.getByRole('button',{name:'Cancel'})).toBeInTheDocument();
    expect(d.getByRole('button',{name:'Add to Q-24817'})).toBeEnabled();
    fireEvent.click(choices[1]);
    expect(d.getByRole('button',{name:'Add to Q-24790'})).toBeEnabled();
  });

  it('adds the item at the quantity through the add-line route, then opens the quote',async()=>{
    fetchMock.mockResolvedValue(new Response(JSON.stringify({line_id:'l-9'}),{status:201}));
    const d=open();
    fireEvent.change(d.getByRole('textbox',{name:'Quantity'}),{target:{value:'3'}});
    await act(async()=>{fireEvent.click(d.getByRole('button',{name:'Add to Q-24817'}));});
    expect(fetchMock).toHaveBeenCalledWith('/api/rep/quotes/Q-24817/lines',expect.objectContaining({method:'POST'}));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({itemId:'HCS-12-13-2G8',qty:3});
    await waitFor(()=>expect(router.push).toHaveBeenCalledWith('/rep/quotes/Q-24817'));
  });

  it('shows the server\'s reason in one red line when it refuses, and stays open',async()=>{
    fetchMock.mockResolvedValue(new Response(JSON.stringify({detail:'Q-24817 was sent to the customer. It can\'t be edited unless they ask for changes.'}),{status:409}));
    const d=open();
    await act(async()=>{fireEvent.click(d.getByRole('button',{name:'Add to Q-24817'}));});
    expect(await d.findByRole('alert')).toHaveTextContent('Q-24817 was sent to the customer.');
    expect(router.push).not.toHaveBeenCalled();
  });

  it('Start a new quote: no route starts a quote from Stock yet (open question), so its button stays disabled',()=>{
    const d=open();
    fireEvent.click(d.getByRole('radio',{name:/Start a new quote/}));
    expect(d.getByRole('button',{name:'Start a new quote'})).toBeDisabled();
  });

  it('with no drafts, Start a new quote is the only choice',()=>{
    render(<StockList list={ITEM_LIST} category={null} targets={[]}/>);
    fireEvent.click(within(bodyRows()[0]).getByRole('button',{name:'Add to quote'}));
    expect(within(dialog()).getAllByRole('radio').map(c=>c.textContent)).toEqual(['+Start a new quote']);
    expect(within(dialog()).getByRole('radio')).toBeChecked();
  });

  it('a whole quantity of at least 1; Cancel and Escape close it',()=>{
    const d=open();
    fireEvent.change(d.getByRole('textbox',{name:'Quantity'}),{target:{value:'0'}});
    expect(d.getByRole('button',{name:'Add to Q-24817'})).toBeDisabled();
    fireEvent.click(d.getByRole('button',{name:'Cancel'}));
    expect(screen.queryByRole('dialog',{name:'Add to quote'})).toBeNull();
    fireEvent.click(within(bodyRows()[0]).getByRole('button',{name:'Add to quote'}));
    fireEvent.keyDown(dialog(),{key:'Escape'});
    expect(screen.queryByRole('dialog',{name:'Add to quote'})).toBeNull();
  });
});

describe('ItemDetail (C_ST2)',()=>{
  it('heads the page with the item and "<sku>, <category>, <pack>"',()=>{
    render(<ItemDetail view={BOLTS_VIEW} allCustomers targets={TARGETS}/>);
    expect(screen.getByRole('heading',{level:1})).toHaveTextContent('Hex cap screw 1/2-13 x 2 in, Grade 8, yellow zinc');
    expect(screen.getByText(', Fasteners, Box of 50',{exact:false})).toHaveTextContent('HCS-12-13-2G8, Fasteners, Box of 50');
    expect(screen.queryByRole('navigation',{name:'Breadcrumb'})).toBeNull();
  });

  it('stock by branch with what is on order and when it arrives, and the all-branches total',()=>{
    render(<ItemDetail view={{...BOLTS_VIEW,item:STRAPS}} allCustomers targets={TARGETS}/>);
    const stock=within(card('Stock by branch'));
    expect(stock.getByText('27 available')).toBeInTheDocument();
    expect(stock.getAllByRole('columnheader').map(h=>h.textContent)).toEqual([':: Branch',':: Available',':: On order',':: Next receipt']);
    expect(stock.getAllByRole('row').slice(1).map(r=>r.textContent)).toEqual(['Salt Lake CitySLC70-','Ogden200-','Provo024Sep 26, 2026','All branches2724']);
  });

  it('recent orders at the prices paid: every customer\'s for the manager, a rep\'s own otherwise (task U1)',()=>{
    const {unmount}=render(<ItemDetail view={BOLTS_VIEW} allCustomers targets={TARGETS}/>);
    const sales=within(card('Recent orders'));
    expect(sales.getByText('All customers')).toBeInTheDocument();
    expect(sales.getAllByRole('columnheader').map(h=>h.textContent)).toEqual([':: Order',':: Customer',':: Ordered',':: Qty',':: Price paid']);
    expect(sales.getAllByRole('row').slice(1).map(r=>r.textContent)).toEqual([
      'SO-51221Wasatch Mechanical ContractorsAug 12, 202610$31.50','SO-51213Wasatch Mechanical ContractorsApr 21, 202612$30.40',
    ]);
    expect(sales.getByRole('link',{name:'SO-51221'})).toHaveAttribute('href','/rep/orders/SO-51221');
    unmount();
    render(<ItemDetail view={{...BOLTS_VIEW,sales:[]}} allCustomers={false} targets={TARGETS}/>);
    expect(within(card('Recent orders')).getByText('Your customers')).toBeInTheDocument();
    expect(card('Recent orders')).toHaveTextContent('None of your customers has ordered this item yet.');
  });

  it('the price box (list price per pack, in stock, Add to quote) and the item details',()=>{
    render(<ItemDetail view={BOLTS_VIEW} allCustomers targets={TARGETS}/>);
    const price=within(screen.getByRole('region',{name:'List price'}));
    expect(price.getByText('$38.95')).toBeInTheDocument();
    expect(price.getByText('List price per box of 50')).toBeInTheDocument();
    expect(price.getByText('In stock, all branches').nextElementSibling).toHaveTextContent('94');
    const facts=within(card('Item details'));
    expect(facts.getAllByRole('term').map(t=>[t.textContent,t.nextElementSibling?.textContent])).toEqual([
      ['SKU','HCS-12-13-2G8'],['Category','Fasteners'],['Sold as','Box of 50'],['Full case','10 packs'],['List price','$38.95'],
    ]);
    fireEvent.click(price.getByRole('button',{name:'Add to quote'}));
    expect(within(dialog()).getByText('Hex cap screw 1/2-13 x 2 in, Grade 8, yellow zinc')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/cost|margin|\u2014/i);
  });
});
