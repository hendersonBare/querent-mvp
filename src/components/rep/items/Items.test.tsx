import type {AnchorHTMLAttributes,ReactNode} from 'react';
import {fireEvent,render,screen,within} from '@testing-library/react';
import {describe,expect,it,vi} from 'vitest';
import {BOLTS_VIEW,ITEM_LIST,STRAPS} from '../reference/test-fixtures';

// The rep's Items list and item page (task 3.8).

const push=vi.fn();
vi.mock('next/navigation',()=>({useRouter:()=>({push})}));
vi.mock('next/link',()=>({default:({href,children,prefetch:_p,...rest}:AnchorHTMLAttributes<HTMLAnchorElement>&{href:string;prefetch?:boolean;children?:ReactNode})=><a href={href} {...rest}>{children}</a>}));

const {ItemsList}=await import('./ItemsList');
const {ItemDetail}=await import('./ItemDetail');

const ALL={customerId:null,label:'All customers'};
const WASATCH={customerId:'wasatch',label:'Wasatch Mechanical Contractors'};
const GREAT_BASIN={customerId:'great-basin',label:'Great Basin Fabrication'};

describe('ItemsList',()=>{
  it('lists each item with its category, list price and stock at every branch',()=>{
    render(<ItemsList list={ITEM_LIST} viewing={ALL}/>);
    expect(screen.getByRole('heading',{level:1})).toHaveTextContent('Items');
    expect(screen.getByText(/Herrick’s catalog · 2 items · stock at SLC, Ogden and Provo/)).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader').map(h=>h.textContent)).toEqual(['Item','Category','List price','SLC','Ogden','Provo','Total']);
    // Item (with the list price phones show under it), category, list price, then available at SLC, Ogden, Provo (with what's on order), and the total.
    expect(screen.getAllByRole('row').slice(1).map(r=>r.textContent)).toEqual([
      'Hex cap screw 1/2-13 x 2 in, Grade 8, yellow zincHCS-12-13-2G8 · Box of 50List $38.95Fasteners$38.956422894',
      'Ratchet strap 2 in x 27 ft, 3,333 lb WLL, J-hooksRS-2-27-JH · EachList $28.50Material Handling & Tie-downs$28.507200+24 on order27',
    ]);
    expect(screen.getByRole('link',{name:'Hex cap screw 1/2-13 x 2 in, Grade 8, yellow zinc'})).toHaveAttribute('href','/rep/items/HCS-12-13-2G8');
  });

  it('filters by category with one dropdown, All by default, keeping the picked customer',()=>{
    const {unmount}=render(<ItemsList list={ITEM_LIST} viewing={WASATCH}/>);
    const select=screen.getByRole('combobox',{name:'Category'});
    expect(select).toHaveValue('');
    expect(within(select).getAllByRole('option').map(o=>o.textContent)).toEqual(['All categories (2)','Fasteners (1)','Material Handling & Tie-downs (1)']);
    // The dropdown is the only category filter: no category links or tabs.
    expect(screen.queryByRole('navigation',{name:'Filter by category'})).not.toBeInTheDocument();
    expect(screen.queryByRole('link',{name:/^Fasteners/})).not.toBeInTheDocument();
    fireEvent.change(select,{target:{value:'material-handling'}});
    expect(push).toHaveBeenLastCalledWith('/rep/items?category=material-handling&customer=wasatch');
    unmount();

    render(<ItemsList list={{...ITEM_LIST,category:{id:'material-handling',name:'Material Handling & Tie-downs',sort_order:4},items:[STRAPS]}} viewing={WASATCH}/>);
    const filtered=screen.getByRole('combobox',{name:'Category'});
    expect(filtered).toHaveValue('material-handling');
    expect(screen.getAllByRole('row')).toHaveLength(2);
    expect(screen.getByRole('link',{name:/Ratchet strap/})).toHaveAttribute('href','/rep/items/RS-2-27-JH?customer=wasatch');
    expect(screen.getByText(/the same for every customer/)).toBeInTheDocument();
    fireEvent.change(filtered,{target:{value:''}});
    expect(push).toHaveBeenLastCalledWith('/rep/items?customer=wasatch');
  });

  it('carries no cost or margin',()=>{
    render(<ItemsList list={ITEM_LIST} viewing={ALL}/>);
    expect(document.body.textContent).not.toMatch(/cost|margin/i);
  });
});

describe('ItemDetail',()=>{
  it('shows the item facts and stock at each branch',()=>{
    render(<ItemDetail view={BOLTS_VIEW} viewing={ALL}/>);
    expect(screen.getByRole('navigation',{name:'Breadcrumb'})).toHaveTextContent('Items/HCS-12-13-2G8');
    expect(screen.getByRole('heading',{level:1})).toHaveTextContent('Hex cap screw 1/2-13 x 2 in, Grade 8, yellow zinc');
    expect(screen.getByRole('heading',{level:1}).parentElement?.nextElementSibling).toHaveTextContent('HCS-12-13-2G8 · Fasteners · Box of 50');
    const stock=within(screen.getByRole('region',{name:'Stock by branch'}));
    expect(stock.getAllByRole('row').slice(1).map(r=>r.textContent)).toEqual(['Salt Lake CitySLC640—','Ogden220—','Provo80—','All branches940']);
    const facts=within(screen.getByRole('region',{name:'Item'}));
    expect(Object.fromEntries(facts.getAllByRole('term').map(dt=>[dt.textContent,dt.nextElementSibling?.textContent]))).toEqual({
      'SKU':'HCS-12-13-2G8','Category':'Fasteners','Sold as':'Box of 50','Full case':'10 packs','List price':'$38.95',
    });
    // The category is plain text: the Items dropdown is the only way to filter by it.
    expect(facts.queryByRole('link',{name:'Fasteners'})).not.toBeInTheDocument();
  });

  it('shows what is on order and when it arrives',()=>{
    render(<ItemDetail view={{...BOLTS_VIEW,item:STRAPS,sales:[]}} viewing={ALL}/>);
    const stock=within(screen.getByRole('region',{name:'Stock by branch'}));
    expect(stock.getAllByRole('row').slice(1).map(r=>r.textContent)).toEqual(['Salt Lake CitySLC70—','Ogden200—','Provo024Sep 26, 2026','All branches2724']);
    expect(screen.getByRole('heading',{name:'No orders for this item yet'})).toBeInTheDocument();
  });

  it('lists recent orders with the prices paid, for the picked customer only when one is picked',()=>{
    const {unmount}=render(<ItemDetail view={BOLTS_VIEW} viewing={ALL}/>);
    const sales=within(screen.getByRole('region',{name:'Recent orders'}));
    expect(sales.getAllByRole('columnheader').map(h=>h.textContent)).toEqual(['Order','Customer','Ordered','Qty','Price paid']);
    expect(sales.getAllByRole('row').slice(1).map(r=>r.textContent)).toEqual([
      'SO-51221Wasatch Mechanical ContractorsAug 12, 202610$31.50','SO-51213Wasatch Mechanical ContractorsApr 21, 202612$30.40',
    ]);
    expect(sales.getByRole('link',{name:'SO-51221'})).toHaveAttribute('href','/rep/orders/SO-51221');
    unmount();

    render(<ItemDetail view={{...BOLTS_VIEW,sales:[]}} viewing={GREAT_BASIN}/>);
    expect(screen.getByRole('region',{name:'Recent orders'})).toHaveTextContent('Great Basin Fabrication');
    expect(screen.getByRole('heading',{name:'Great Basin Fabrication hasn’t ordered this item'})).toBeInTheDocument();
    expect(screen.getByRole('link',{name:'Items'})).toHaveAttribute('href','/rep/items?customer=great-basin');
  });

  it('keeps the picked customer on its order and breadcrumb links',()=>{
    render(<ItemDetail view={BOLTS_VIEW} viewing={WASATCH}/>);
    expect(screen.getByRole('link',{name:'SO-51221'})).toHaveAttribute('href','/rep/orders/SO-51221?customer=wasatch');
    expect(screen.getByRole('link',{name:'Items'})).toHaveAttribute('href','/rep/items?customer=wasatch');
  });

  it('carries no cost or margin',()=>{
    render(<ItemDetail view={BOLTS_VIEW} viewing={ALL}/>);
    expect(document.body.textContent).not.toMatch(/cost|margin/i);
  });
});
