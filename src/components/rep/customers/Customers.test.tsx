import type {AnchorHTMLAttributes,ReactNode} from 'react';
import {render,screen,within} from '@testing-library/react';
import {describe,expect,it,vi} from 'vitest';
import {DIRECTORY,GREAT_BASIN_VIEW,WASATCH_VIEW} from '../reference/test-fixtures';

// The rep's Customers list and customer page (task 3.8).

vi.mock('next/link',()=>({default:({href,children,prefetch:_p,...rest}:AnchorHTMLAttributes<HTMLAnchorElement>&{href:string;prefetch?:boolean;children?:ReactNode})=><a href={href} {...rest}>{children}</a>}));

const {CustomersList}=await import('./CustomersList');
const {CustomerDetail}=await import('./CustomerDetail');

const ALL={customerId:null,label:'All customers'};
const WASATCH={customerId:'wasatch',label:'Wasatch Mechanical Contractors'};
const rowFor=(name:string)=>screen.getByRole('rowheader',{name:new RegExp(name)}).closest('tr')!;
const panel=(name:string)=>screen.getByRole('region',{name});

describe('CustomersList',()=>{
  it('lists every customer with its account number and assigned rep, marking the signed-in rep\'s',()=>{
    render(<CustomersList rows={DIRECTORY} viewing={ALL} repId="brandi"/>);
    expect(screen.getByRole('heading',{level:1})).toHaveTextContent('Customers');
    expect(screen.getByText('Viewing All customers · 3 customers')).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader').map(h=>h.textContent)).toEqual(['Customer','Rep','Terms','Open balance','Last order','Orders','Quotes']);
    const wasatch=within(rowFor('Wasatch'));
    expect(wasatch.getByRole('link',{name:'Wasatch Mechanical Contractors'})).toHaveAttribute('href','/rep/customers/wasatch');
    expect(rowFor('Wasatch')).toHaveTextContent('WAS-1142');
    expect(rowFor('Wasatch')).toHaveTextContent('Brandi GallegosYou');
    expect(wasatch.getAllByRole('cell').map(c=>c.textContent)).toEqual(['Brandi GallegosYou','Net 30','$18,420.00of $50,000.00','Sep 9, 2026','23','25']);
    expect(rowFor('Canyon Ridge')).toHaveTextContent('Mara Jensen');
    expect(within(rowFor('Canyon Ridge')).queryByText('You')).toBeNull();
  });

  it('shows placeholder customers\' missing account details as empty states',()=>{
    render(<CustomersList rows={DIRECTORY} viewing={ALL} repId="brandi"/>);
    const cells=within(rowFor('Great Basin')).getAllByRole('cell').map(c=>c.textContent);
    expect(cells).toEqual(['Brandi GallegosYou','Not on file','—','No orders yet','0','0']);
  });

  it('keeps the picked customer on its links and says the list is narrowed',()=>{
    render(<CustomersList rows={DIRECTORY.filter(c=>c.id==='wasatch')} viewing={WASATCH} repId="brandi"/>);
    expect(screen.getByText('Viewing Wasatch Mechanical Contractors · 1 customer')).toBeInTheDocument();
    expect(screen.getByRole('link',{name:'Wasatch Mechanical Contractors'})).toHaveAttribute('href','/rep/customers/wasatch?customer=wasatch');
    expect(screen.getByText(/Showing Wasatch Mechanical Contractors only/)).toBeInTheDocument();
  });

  it('carries no cost or margin column',()=>{
    render(<CustomersList rows={DIRECTORY} viewing={ALL} repId="brandi"/>);
    expect(document.body.textContent).not.toMatch(/cost|margin/i);
  });
});

describe('CustomerDetail',()=>{
  it('shows the account, terms, credit, win rate, rep and contacts',()=>{
    render(<CustomerDetail view={WASATCH_VIEW} viewing={ALL} repId="brandi"/>);
    expect(screen.getByRole('navigation',{name:'Breadcrumb'})).toHaveTextContent('Customers/WAS-1142');
    expect(screen.getByRole('link',{name:'Customers'})).toHaveAttribute('href','/rep/customers');
    expect(screen.getByRole('heading',{level:1})).toHaveTextContent('Wasatch Mechanical Contractors');
    expect(screen.getByText(/Rep Brandi Gallegos \(you\) · Net 30/)).toBeInTheDocument();
    const account=within(panel('Account'));
    const facts=Object.fromEntries(account.getAllByRole('term').map(dt=>[dt.textContent,dt.nextElementSibling?.textContent]));
    expect(facts).toEqual({'Terms':'Net 30','Credit limit':'$50,000.00','Open balance':'$18,420.00','Past due':'$0.00','Tax status':'Taxable (UT)',
      'Quote win rate':'71%17 of 24 decided quotes','Main phone':'(801) 555-0148'});
    expect(account.getByRole('img',{name:'Credit used: 37% of $50,000.00'})).toBeInTheDocument();
    expect(panel('Account')).toHaveTextContent('1800 W 10950 S');
    expect(panel('Rep')).toHaveTextContent('Brandi GallegosYouInside Sales(801) 111-2222brandi.gallegos@herrickindustrial.com');
    expect(panel('Contacts')).toHaveTextContent('Dana OrtizPrimaryPurchasing(801) 555-0142');
  });

  it('lists recent orders and quotes, linking to each and to the full lists for this customer',()=>{
    render(<CustomerDetail view={WASATCH_VIEW} viewing={ALL} repId="brandi"/>);
    const orders=within(panel('Recent orders'));
    expect(orders.getByRole('link',{name:'SO-51223'})).toHaveAttribute('href','/rep/orders/SO-51223');
    expect(orders.getByRole('link',{name:'View all 23 orders'})).toHaveAttribute('href','/rep/orders?customer=wasatch');
    expect(orders.getAllByRole('row')[1]).toHaveTextContent('SO-51223PO 7777Sep 9, 2026Delivery · SLCShipped$698.22');

    const quotes=within(panel('Recent quotes'));
    expect(quotes.getByRole('link',{name:'Q-24817'})).toHaveAttribute('href','/rep/quotes/Q-24817');
    expect(quotes.getByRole('link',{name:'View all 25 quotes'})).toHaveAttribute('href','/rep/quotes?customer=wasatch');
    const rows=quotes.getAllByRole('row').slice(1).map(r=>r.textContent);
    expect(rows).toEqual([
      'Q-24817Not sent · 4 linesSep 23, 2026Draft readyNot sent',
      'Q-24816rev 1 · 3 linesSep 7, 2026Accepted$655.25',
      'Q-24815rev 1 · 2 linesSep 2, 2026Expired$322.80',
    ]);
  });

  it('keeps the picked customer on its links',()=>{
    render(<CustomerDetail view={WASATCH_VIEW} viewing={WASATCH} repId="brandi"/>);
    expect(screen.getByRole('link',{name:'Customers'})).toHaveAttribute('href','/rep/customers?customer=wasatch');
    expect(screen.getByRole('link',{name:'SO-51223'})).toHaveAttribute('href','/rep/orders/SO-51223?customer=wasatch');
    expect(screen.getByRole('link',{name:'Q-24817'})).toHaveAttribute('href','/rep/quotes/Q-24817?customer=wasatch');
  });

  it('shows a placeholder customer\'s rep, and empty states for its account, contacts, orders and quotes',()=>{
    render(<CustomerDetail view={GREAT_BASIN_VIEW} viewing={ALL} repId="brandi"/>);
    expect(screen.getByRole('heading',{level:1})).toHaveTextContent('Great Basin Fabrication');
    expect(panel('Account')).toHaveTextContent('Terms, credit and ship-to aren’t on file for Great Basin Fabrication yet.');
    expect(panel('Rep')).toHaveTextContent('Brandi Gallegos');
    expect(panel('Contacts')).toHaveTextContent('No contacts on file.');
    expect(within(panel('Recent orders')).getByRole('heading',{name:'No orders yet'})).toBeInTheDocument();
    expect(within(panel('Recent quotes')).getByRole('heading',{name:'No quotes yet'})).toBeInTheDocument();
    expect(screen.queryByRole('link',{name:/View all/})).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('marks another rep\'s customer without "you"',()=>{
    render(<CustomerDetail view={{...GREAT_BASIN_VIEW,account:{...GREAT_BASIN_VIEW.account,rep:{...GREAT_BASIN_VIEW.account.rep!,id:'mara',name:'Mara Jensen'}}}} viewing={ALL} repId="brandi"/>);
    expect(screen.getByText(/Rep Mara Jensen/)).not.toHaveTextContent('(you)');
    expect(within(panel('Rep')).queryByText('You')).toBeNull();
  });

  it('carries no cost or margin',()=>{
    render(<CustomerDetail view={WASATCH_VIEW} viewing={ALL} repId="brandi"/>);
    expect(document.body.textContent).not.toMatch(/cost|margin/i);
  });
});
