import type {AnchorHTMLAttributes,ReactNode} from 'react';
import {render,screen,within} from '@testing-library/react';
import {describe,expect,it,vi} from 'vitest';
import {ORDER,ORDERS} from '../reference/test-fixtures';

// The rep's Orders list and order page (task 3.8).

vi.mock('next/link',()=>({default:({href,children,prefetch:_p,...rest}:AnchorHTMLAttributes<HTMLAnchorElement>&{href:string;prefetch?:boolean;children?:ReactNode})=><a href={href} {...rest}>{children}</a>}));

const {OrdersList}=await import('./OrdersList');
const {OrderDetail}=await import('./OrderDetail');

const ALL={customerId:null,label:'All customers'};
const WASATCH={customerId:'wasatch',label:'Wasatch Mechanical Contractors'};
const GREAT_BASIN={customerId:'great-basin',label:'Great Basin Fabrication'};

describe('OrdersList',()=>{
  it('lists every customer\'s orders newest first, naming the customer',()=>{
    render(<OrdersList rows={ORDERS} viewing={ALL}/>);
    expect(screen.getByRole('heading',{level:1})).toHaveTextContent('Orders');
    expect(screen.getByText('Viewing All customers · 2 orders')).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader').map(h=>h.textContent)).toEqual(['Order','Customer','Ordered','Fulfillment','Status','Lines','Total']);
    const rows=screen.getAllByRole('row').slice(1);
    expect(rows.map(r=>r.textContent)).toEqual([
      'SO-51223PO 7777 · from Q-24816Wasatch Mechanical ContractorsWAS-1142Sep 9, 2026Delivery · SLCShipped3$698.22',
      'SO-51222PO 7776Wasatch Mechanical ContractorsWAS-1142Aug 26, 2026Will call · ProvoClosed2$193.48',
    ]);
    expect(within(rows[0]).getByRole('link',{name:'SO-51223'})).toHaveAttribute('href','/rep/orders/SO-51223');
  });

  it('follows its own ?customer=: one customer\'s orders without the customer column; links don\'t carry it (task U1)',()=>{
    render(<OrdersList rows={ORDERS} viewing={WASATCH}/>);
    expect(screen.getByText('Viewing Wasatch Mechanical Contractors · 2 orders')).toBeInTheDocument();
    expect(screen.queryByRole('columnheader',{name:'Customer'})).toBeNull();
    expect(screen.getByRole('link',{name:'SO-51223'})).toHaveAttribute('href','/rep/orders/SO-51223');
  });

  it('shows an empty state for a placeholder customer',()=>{
    render(<OrdersList rows={[]} viewing={GREAT_BASIN}/>);
    expect(screen.getByText('Viewing Great Basin Fabrication · 0 orders')).toBeInTheDocument();
    expect(screen.getByRole('heading',{name:'No orders for Great Basin Fabrication yet'})).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });
});

describe('OrderDetail',()=>{
  it('shows the lines at the prices paid, and the totals',()=>{
    render(<OrderDetail order={ORDER}/>);
    expect(screen.getByRole('navigation',{name:'Breadcrumb'})).toHaveTextContent('Orders/SO-51223');
    expect(screen.getByRole('heading',{level:1})).toHaveTextContent('SO-51223');
    expect(screen.getByRole('heading',{level:1}).parentElement).toHaveTextContent('SO-51223Shipped');
    expect(screen.getByText(/Wasatch Mechanical Contractors · PO 7777 · Ordered Sep 9, 2026/)).toBeInTheDocument();
    const lines=within(screen.getByRole('region',{name:'Items'}));
    expect(lines.getAllByRole('columnheader').map(h=>h.textContent)).toEqual(['Item','Qty','Price paid','Total']);
    expect(lines.getAllByRole('row').slice(1).map(r=>r.textContent)).toEqual([
      'Cut-off wheel 4.5 x .045 x 7/8 in, Type 1CW-45-045-T1 · Box of 254$36.00$144.00',
      'Nitrile disposable gloves, 8 mil, black, size LGLV-N8-L-1000 · Case of 1,0004$79.00$316.00',
      'Flap disc 4.5 in, 60 grit zirconiaFD-45-60Z · Box of 103$44.25$132.75',
    ]);
    expect(lines.getByRole('link',{name:'Cut-off wheel 4.5 x .045 x 7/8 in, Type 1'})).toHaveAttribute('href','/rep/stock/CW-45-045-T1');
    const totals=Object.fromEntries(lines.getAllByRole('term').map(dt=>[dt.textContent,dt.nextElementSibling?.textContent]));
    expect(totals).toEqual({'Items':'$592.75','Freight':'$62.50','Sales tax':'$42.97','Order total':'$698.22'});
  });

  it('shows the order facts, linking the customer and the quote it came from',()=>{
    render(<OrderDetail order={ORDER}/>);
    const facts=within(screen.getByRole('region',{name:'Order'}));
    expect(Object.fromEntries(facts.getAllByRole('term').map(dt=>[dt.textContent,dt.nextElementSibling?.textContent]))).toEqual({
      'Customer':'Wasatch Mechanical Contractors','Account':'WAS-1142','Customer PO':'7777','Ordered':'Sep 9, 2026','Fulfillment':'Delivery · SLC','Shipped':'Sep 10, 2026','From quote':'Q-24816',
    });
    expect(facts.getByRole('link',{name:'Wasatch Mechanical Contractors'})).toHaveAttribute('href','/rep/customers/wasatch');
    expect(facts.getByRole('link',{name:'Q-24816'})).toHaveAttribute('href','/rep/quotes/Q-24816');
    expect(screen.getByRole('link',{name:'Orders'})).toHaveAttribute('href','/rep/orders');
    // Each line opens its item; no link carries a customer filter (task U1).
    expect(within(screen.getByRole('region',{name:'Items'})).getAllByRole('link').map(l=>l.getAttribute('href'))).toEqual([
      '/rep/stock/CW-45-045-T1','/rep/stock/GLV-N8-L-1000','/rep/stock/FD-45-60Z',
    ]);
  });

  it('says a will-call order was picked up and has no quote, and carries no cost or margin',()=>{
    render(<OrderDetail order={{...ORDER,fulfillment:'will_call',branch_code:'Provo',freight:0,quote_number:null}}/>);
    const facts=within(screen.getByRole('region',{name:'Order'}));
    expect(facts.getByText('Picked up')).toBeInTheDocument();
    expect(facts.getByText('Direct order')).toBeInTheDocument();
    expect(screen.getByText('Freight (will call)')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/cost|margin/i);
  });
});
