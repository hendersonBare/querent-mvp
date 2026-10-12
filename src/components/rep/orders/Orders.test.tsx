import type {AnchorHTMLAttributes,ReactNode} from 'react';
import {fireEvent,render,screen,within} from '@testing-library/react';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {BRANCHES,ORDER,ORDERS,PICKER_CUSTOMERS} from '../reference/test-fixtures';

// The Orders list and order page (plan U5; C_ORBase, C_OR1, C_OR2): read-only, from the ERP.

const router=vi.hoisted(()=>({push:vi.fn(),replace:vi.fn(),refresh:vi.fn()}));
vi.mock('next/link',()=>({default:({href,children,prefetch:_p,...rest}:AnchorHTMLAttributes<HTMLAnchorElement>&{href:string;prefetch?:boolean;children?:ReactNode})=><a href={href} {...rest}>{children}</a>}));
vi.mock('next/navigation',()=>({useRouter:()=>router}));

const {OrdersList}=await import('./OrdersList');
const {OrderDetail}=await import('./OrderDetail');

const headers=()=>screen.getAllByRole('columnheader').map(h=>h.textContent);
const bodyRows=()=>screen.getAllByRole('row').slice(1);
const card=(name:string)=>screen.getByRole('region',{name});
const panel=()=>screen.getByRole('dialog',{name:'Filter orders'});
/** Every rep with customers the reader may read (C_OR1 lists reps beyond those with orders). */
const REPS=[{id:'brandi',name:'Brandi Gallegos'},{id:'mara',name:'Mara Jensen'}];
const labels=(group:HTMLElement)=>within(group).getAllByRole('checkbox').map(c=>c.closest('label')!.textContent);
/** 23 orders, as the seed has: Show N more after the first 10 (C_ORBase "Show 13 more orders"). */
const MANY=Array.from({length:23},(_,i)=>({...ORDERS[i%2],id:`so-${i}`,order_number:`SO-${51300-i}`}));

beforeEach(()=>{router.push.mockClear();});

describe('OrdersList, manager (C_ORBase)',()=>{
  it('has the customer picker, Filter and the count, and the columns with Rep',()=>{
    render(<OrdersList rows={ORDERS} customers={PICKER_CUSTOMERS} customerId={null} branches={BRANCHES} reps={REPS} manager/>);
    expect(screen.getByRole('heading',{level:1})).toHaveTextContent('Orders');
    expect(screen.getByRole('combobox',{name:'Customer, All customers'})).toBeInTheDocument();
    expect(screen.getByText('2 orders')).toBeInTheDocument();
    expect(headers()).toEqual([':: Order',':: Customer',':: Rep',':: Ordered',':: Fulfillment',':: Status',':: Lines',':: Total']);
    expect(screen.getByRole('button',{name:'Choose columns'})).toBeInTheDocument();
  });

  it('shows each order newest first with its PO and quote, customer and account, rep, day, fulfillment, status, lines and total',()=>{
    render(<OrdersList rows={ORDERS} customers={PICKER_CUSTOMERS} customerId={null} branches={BRANCHES} reps={REPS} manager/>);
    expect(bodyRows().map(r=>within(r).getAllByRole('cell').map(c=>c.textContent))).toEqual([
      ['SO-51223PO 7777, from Q-24816','Wasatch Mechanical ContractorsWAS-1142','Brandi Gallegos','Sep 9, 2026','Delivery, SLC','Shipped','3','$698.22'],
      ['SO-51222PO 7776','Wasatch Mechanical ContractorsWAS-1142','Brandi Gallegos','Aug 26, 2026','Will call, Provo','Closed','2','$193.48'],
    ]);
    expect(screen.getByRole('link',{name:'SO-51223'})).toHaveAttribute('href','/rep/orders/SO-51223');
    // Read-only (ERP): nothing to edit, add or remove.
    expect(screen.queryByRole('button',{name:/Add|Edit|Delete|Remove/})).toBeNull();
    expect(document.body.textContent).not.toMatch(/cost|margin|—|·/i);
  });

  it('shows the first 10, then "Show 13 more orders"',()=>{
    render(<OrdersList rows={MANY} customers={PICKER_CUSTOMERS} customerId={null} branches={BRANCHES} reps={REPS} manager/>);
    expect(bodyRows()).toHaveLength(10);
    fireEvent.click(screen.getByRole('button',{name:'Show 13 more orders'}));
    expect(bodyRows()).toHaveLength(23);
  });

  it('the customer picker loads the page for that customer (?customer=, task U1)',()=>{
    render(<OrdersList rows={ORDERS} customers={PICKER_CUSTOMERS} customerId={null} branches={BRANCHES} reps={REPS} manager/>);
    const box=screen.getByRole('combobox',{name:'Customer, All customers'});
    fireEvent.focus(box);
    fireEvent.mouseDown(screen.getByRole('option',{name:/Wasatch Mechanical Contractors/}));
    expect(router.push).toHaveBeenLastCalledWith('/rep/orders?customer=wasatch');
  });

  it('filter open (C_OR1): Rep, Status, Fulfillment, Branch and the ordered range; applying narrows the list',()=>{
    render(<OrdersList rows={ORDERS} customers={PICKER_CUSTOMERS} customerId={null} branches={BRANCHES} reps={REPS} manager/>);
    fireEvent.click(screen.getByRole('button',{name:/^Filter/}));
    const p=within(panel());
    expect(labels(p.getByRole('group',{name:'Rep'}))).toEqual(['Brandi Gallegos','Mara Jensen']);
    expect(labels(p.getByRole('group',{name:'Status'}))).toEqual(['Shipped','Closed']);
    expect(labels(p.getByRole('group',{name:'Fulfillment'}))).toEqual(['Delivery','Will call']);
    expect(labels(p.getByRole('group',{name:'Branch'}))).toEqual(['SLC','Ogden','Provo']);
    expect(p.getByLabelText('Ordered from')).toHaveAttribute('type','date');
    expect(p.getByLabelText('Ordered to')).toHaveAttribute('type','date');
    fireEvent.click(p.getByRole('checkbox',{name:'Will call'}));
    fireEvent.click(p.getByRole('button',{name:'Apply filters'}));
    expect(screen.getByRole('button',{name:'Filter, 1 applied'})).toBeInTheDocument();
    expect(screen.getByText('1 order')).toBeInTheDocument();
    expect(bodyRows()).toHaveLength(1);
  });

  it('says so in one line when there are no orders',()=>{
    render(<OrdersList rows={[]} customers={PICKER_CUSTOMERS} customerId="great-basin" branches={BRANCHES} reps={REPS} manager/>);
    expect(screen.getByRole('combobox',{name:'Customer, Great Basin Fabrication'})).toBeInTheDocument();
    expect(screen.getByText('No orders for Great Basin Fabrication yet.')).toBeInTheDocument();
    expect(screen.getByText('0 orders')).toBeInTheDocument();
  });
});

describe('OrdersList, rep',()=>{
  it('has no Rep column and no Rep filter (own customers only)',()=>{
    render(<OrdersList rows={ORDERS} customers={PICKER_CUSTOMERS} customerId={null} branches={BRANCHES} reps={REPS} manager={false}/>);
    expect(headers()).toEqual([':: Order',':: Customer',':: Ordered',':: Fulfillment',':: Status',':: Lines',':: Total']);
    fireEvent.click(screen.getByRole('button',{name:/^Filter/}));
    expect(within(panel()).queryByRole('group',{name:'Rep'})).toBeNull();
  });
});

describe('OrderDetail (C_OR2)',()=>{
  it('heads the page with the number, the status chip and "<customer>, PO <po>, ordered <day>"',()=>{
    render(<OrderDetail order={ORDER}/>);
    expect(screen.getByRole('heading',{level:1})).toHaveTextContent('SO-51223');
    expect(screen.getByRole('heading',{level:1}).parentElement).toHaveTextContent('SO-51223Shipped');
    expect(screen.getByText('Wasatch Mechanical Contractors, PO 7777, ordered Sep 9, 2026')).toBeInTheDocument();
    expect(screen.queryByRole('navigation',{name:'Breadcrumb'})).toBeNull();
  });

  it('lists the lines at the prices paid; each opens its item; no filter or columns picker',()=>{
    render(<OrderDetail order={ORDER}/>);
    const items=within(card('Items'));
    expect(items.getByText('3 lines')).toBeInTheDocument();
    expect(items.getAllByRole('columnheader').map(h=>h.textContent)).toEqual([':: Item',':: Qty',':: Price paid',':: Total']);
    expect(items.getAllByRole('row').slice(1).map(r=>r.textContent)).toEqual([
      'Cut-off wheel 4.5 x .045 x 7/8 in, Type 1CW-45-045-T1, Box of 254$36.00$144.00',
      'Nitrile disposable gloves, 8 mil, black, size LGLV-N8-L-1000, Case of 1,0004$79.00$316.00',
      'Flap disc 4.5 in, 60 grit zirconiaFD-45-60Z, Box of 103$44.25$132.75',
    ]);
    expect(items.getAllByRole('link').map(l=>l.getAttribute('href'))).toEqual(['/rep/stock/CW-45-045-T1','/rep/stock/GLV-N8-L-1000','/rep/stock/FD-45-60Z']);
    expect(screen.queryByRole('button',{name:'Choose columns'})).toBeNull();
  });

  it('the total box and the order details, linking the customer and the quote it came from',()=>{
    render(<OrderDetail order={ORDER}/>);
    const total=within(screen.getByRole('region',{name:'Order total'}));
    expect(total.getByText('$698.22')).toBeInTheDocument();
    expect(total.getAllByRole('term').map(t=>[t.textContent,t.nextElementSibling?.textContent])).toEqual([['Items','$592.75'],['Freight','$62.50'],['Sales tax','$42.97']]);
    const facts=within(card('Order details'));
    expect(facts.getAllByRole('term').map(t=>[t.textContent,t.nextElementSibling?.textContent])).toEqual([
      ['Customer','Wasatch Mechanical Contractors'],['Account','WAS-1142'],['Customer PO','7777'],['Ordered','Sep 9, 2026'],['Fulfillment','Delivery, SLC'],
      ['Shipped','Sep 10, 2026'],['From quote','Q-24816'],['Rep','Brandi Gallegos'],
    ]);
    expect(facts.getByRole('link',{name:'Wasatch Mechanical Contractors'})).toHaveAttribute('href','/rep/customers/wasatch');
    expect(facts.getByRole('link',{name:'Q-24816'})).toHaveAttribute('href','/rep/quotes/Q-24816');
  });

  it('says a will-call order was picked up, a direct order has no quote, a missing PO is a hyphen; no cost or margin',()=>{
    render(<OrderDetail order={{...ORDER,status:'closed',fulfillment:'will_call',branch_code:'Provo',freight:0,quote_number:null,po_number:null}}/>);
    const facts=within(card('Order details'));
    expect(facts.getByText('Picked up')).toBeInTheDocument();
    expect(facts.getByText('Direct order')).toBeInTheDocument();
    expect(facts.getByText('Customer PO').nextElementSibling).toHaveTextContent('-');
    expect(screen.getByText('Wasatch Mechanical Contractors, ordered Sep 9, 2026')).toBeInTheDocument();
    expect(screen.getByRole('heading',{level:1}).parentElement).toHaveTextContent('SO-51223Closed');
    expect(document.body.textContent).not.toMatch(/cost|margin|—/i);
  });
});
