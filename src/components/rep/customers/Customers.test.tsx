import type {AnchorHTMLAttributes,ReactNode} from 'react';
import {fireEvent,render,screen,within} from '@testing-library/react';
import {describe,expect,it,vi} from 'vitest';
import {DIRECTORY,GREAT_BASIN_VIEW,WASATCH_VIEW} from '../reference/test-fixtures';

// The Customers list and customer page (plan U5; C_CUBase, C_CU1, C_CU2, C_RCUBase, C_RCU1, C_CU3).
// Styles are proven against the frames in e2e/frames-records.spec.ts; these pin the words, the columns,
// the filters and where each link goes.

vi.mock('next/link',()=>({default:({href,children,prefetch:_p,...rest}:AnchorHTMLAttributes<HTMLAnchorElement>&{href:string;prefetch?:boolean;children?:ReactNode})=><a href={href} {...rest}>{children}</a>}));
vi.mock('next/navigation',()=>({useRouter:()=>({push:vi.fn(),replace:vi.fn(),refresh:vi.fn()})}));

const {CustomersList}=await import('./CustomersList');
const {CustomerDetail}=await import('./CustomerDetail');

const rowFor=(name:string)=>screen.getByRole('link',{name}).closest('[role="row"]') as HTMLElement;
const cells=(name:string)=>within(rowFor(name)).getAllByRole('cell').map(c=>c.textContent);
const headers=()=>screen.getAllByRole('columnheader').map(h=>h.textContent);
const bodyRows=()=>screen.getAllByRole('row').slice(1);
const card=(name:string)=>screen.getByRole('region',{name});
const openFilter=()=>fireEvent.click(screen.getByRole('button',{name:/^Filter/}));
const panel=()=>screen.getByRole('dialog',{name:'Filter customers'});
const labels=(group:HTMLElement)=>within(group).getAllByRole('checkbox').map(c=>c.closest('label')!.textContent);

describe('CustomersList, manager (C_CUBase)',()=>{
  it('has the frame\'s header: title, search, Filter and the count; the columns with Rep',()=>{
    render(<CustomersList rows={DIRECTORY} manager/>);
    expect(screen.getByRole('heading',{level:1})).toHaveTextContent('Customers');
    expect(screen.getByRole('searchbox',{name:'Search customers'})).toBeInTheDocument();
    expect(screen.getByText('Search customers')).toBeInTheDocument();
    expect(screen.getByText('3 customers')).toBeInTheDocument();
    expect(headers()).toEqual([':: Customer',':: Rep',':: Terms',':: Open balance',':: Last order',':: Orders',':: Quotes']);
    expect(screen.getByRole('button',{name:'Choose columns'})).toBeInTheDocument();
  });

  it('shows each customer with account code, rep, terms, open balance of credit limit, last order and counts; the name opens the customer',()=>{
    render(<CustomersList rows={DIRECTORY} manager/>);
    expect(screen.getByRole('link',{name:'Wasatch Mechanical Contractors'})).toHaveAttribute('href','/rep/customers/wasatch');
    expect(cells('Wasatch Mechanical Contractors')).toEqual(['Wasatch Mechanical ContractorsWAS-1142','Brandi Gallegos','Net 30','$18,420.00of $50,000.00','Sep 9, 2026','23','25']);
    expect(cells('Canyon Ridge Builders')[1]).toBe('Mara Jensen');
    // A placeholder customer (spec §2): not on file, a hyphen for the balance, no orders yet.
    expect(cells('Great Basin Fabrication')).toEqual(['Great Basin FabricationGBF-2207','Brandi Gallegos','Not on file','-','No orders yet','0','0']);
    // No link carries a customer filter (task U1).
    expect(screen.getAllByRole('link').map(l=>l.getAttribute('href')).filter(h=>h!.includes('?'))).toEqual([]);
    expect(document.body.textContent).not.toMatch(/cost|margin|\u2014/i);
  });

  it('search narrows by name or account number, and the count follows',()=>{
    render(<CustomersList rows={DIRECTORY} manager/>);
    fireEvent.change(screen.getByRole('searchbox',{name:'Search customers'}),{target:{value:'crb'}});
    expect(bodyRows()).toHaveLength(1);
    expect(screen.getByText('1 customer')).toBeInTheDocument();
    expect(screen.queryByText('Search customers')).toBeNull();
  });

  it('filter open (C_CU1): the description, Rep with counts, Terms, the open balance range and the Only show rules',()=>{
    render(<CustomersList rows={DIRECTORY} manager/>);
    openFilter();
    const p=within(panel());
    expect(p.getByText('Pick one rep or several to see their customers together.')).toBeInTheDocument();
    expect(p.getByRole('group',{name:'Rep'})).toHaveTextContent('Brandi Gallegos2Mara Jensen1');
    expect(labels(p.getByRole('group',{name:'Terms'}))).toEqual(['Net 30','Not on file']);
    expect(p.getByRole('textbox',{name:'Open balance from'})).toHaveAttribute('placeholder','$0.00');
    expect(p.getByRole('textbox',{name:'Open balance to'})).toHaveAttribute('placeholder','$50,000.00');
    expect(labels(p.getByRole('group',{name:'Only show'}))).toEqual(['Has open quotes','Over 80% of credit limit','Never ordered']);
  });

  it('filter applied (C_CU2): the badge, the count, a chip per group with x, and Clear all',()=>{
    render(<CustomersList rows={DIRECTORY} manager/>);
    openFilter();
    fireEvent.click(within(panel()).getByRole('checkbox',{name:/^Brandi Gallegos/}));
    fireEvent.click(within(panel()).getByRole('button',{name:'Apply filters'}));
    expect(screen.getByRole('button',{name:'Filter, 1 applied'})).toBeInTheDocument();
    expect(screen.getByText('2 customers')).toBeInTheDocument();
    expect(bodyRows()).toHaveLength(2);
    expect(screen.getByText('Rep: Brandi Gallegos')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Remove Rep: Brandi Gallegos'}));
    expect(bodyRows()).toHaveLength(3);
    expect(screen.queryByText('Rep: Brandi Gallegos')).toBeNull();

    openFilter();
    fireEvent.click(within(panel()).getByRole('checkbox',{name:'Never ordered'}));
    fireEvent.click(within(panel()).getByRole('checkbox',{name:'Not on file'}));
    fireEvent.click(within(panel()).getByRole('button',{name:'Apply filters'}));
    expect(screen.getByRole('button',{name:'Filter, 2 applied'})).toBeInTheDocument();
    expect(screen.getByText('Terms: Not on file')).toBeInTheDocument();
    expect(screen.getByText('Only show: Never ordered')).toBeInTheDocument();
    expect(bodyRows()).toHaveLength(2);
    fireEvent.click(screen.getByRole('button',{name:'Clear all'}));
    expect(bodyRows()).toHaveLength(3);
    expect(screen.queryByRole('button',{name:/applied/})).toBeNull();
  });

  it('says so in one line when nothing matches',()=>{
    render(<CustomersList rows={DIRECTORY} manager/>);
    fireEvent.change(screen.getByRole('searchbox',{name:'Search customers'}),{target:{value:'zzz'}});
    expect(screen.getByText('No customers match.')).toBeInTheDocument();
    expect(screen.getByText('0 customers')).toBeInTheDocument();
  });
});

describe('CustomersList, rep (C_RCUBase, C_RCU1)',()=>{
  it('has no Rep column and no Rep filter, and its own description',()=>{
    render(<CustomersList rows={DIRECTORY.filter(c=>c.rep_id==='brandi')} manager={false}/>);
    expect(headers()).toEqual([':: Customer',':: Terms',':: Open balance',':: Last order',':: Orders',':: Quotes']);
    expect(screen.getByText('2 customers')).toBeInTheDocument();
    openFilter();
    expect(within(panel()).getByText('Narrow your customers by terms, balance or open quotes.')).toBeInTheDocument();
    expect(within(panel()).queryByRole('group',{name:'Rep'})).toBeNull();
    expect(within(panel()).getByRole('group',{name:'Terms'})).toBeInTheDocument();
  });
});

describe('CustomerDetail (C_CU3)',()=>{
  it('heads the page with the name and "<account>, rep <name>, <terms>", and no breadcrumb',()=>{
    render(<CustomerDetail view={WASATCH_VIEW} supplierName="Herrick"/>);
    expect(screen.getByRole('heading',{level:1})).toHaveTextContent('Wasatch Mechanical Contractors');
    expect(screen.getByText(', rep Brandi Gallegos, Net 30',{exact:false})).toHaveTextContent('WAS-1142, rep Brandi Gallegos, Net 30');
    expect(screen.queryByRole('navigation',{name:'Breadcrumb'})).toBeNull();
  });

  it('lists recent quotes with "View all" to this customer\'s quotes, and recent orders the same way',()=>{
    render(<CustomerDetail view={WASATCH_VIEW} supplierName="Herrick"/>);
    const quotes=within(card('Recent quotes'));
    expect(quotes.getByText('25 quotes')).toBeInTheDocument();
    expect(quotes.getByRole('link',{name:'View all 25 quotes'})).toHaveAttribute('href','/rep/quotes?customer=wasatch');
    expect(quotes.getAllByRole('columnheader').map(h=>h.textContent)).toEqual([':: Quote',':: Requested',':: Status',':: Total']);
    expect(quotes.getAllByRole('row').slice(1).map(r=>r.textContent)).toEqual([
      'Q-24817Not sent, 4 linesSep 23, 2026Draft readyNot sent','Q-24816rev 1, 3 linesSep 7, 2026Accepted$655.25','Q-24815rev 1, 2 linesSep 2, 2026Expired$322.80',
    ]);
    expect(quotes.getByRole('link',{name:'Q-24817'})).toHaveAttribute('href','/rep/quotes/Q-24817');
    const orders=within(card('Recent orders'));
    expect(orders.getByText('23 orders')).toBeInTheDocument();
    expect(orders.getByRole('link',{name:'View all 23 orders'})).toHaveAttribute('href','/rep/orders?customer=wasatch');
    expect(orders.getAllByRole('columnheader').map(h=>h.textContent)).toEqual([':: Order',':: Ordered',':: Fulfillment',':: Status',':: Total']);
    expect(orders.getAllByRole('row')[1]).toHaveTextContent('SO-51223PO 7777Sep 9, 2026Delivery, SLCShipped$698.22');
    expect(orders.getByRole('link',{name:'SO-51223'})).toHaveAttribute('href','/rep/orders/SO-51223');
    // Detail tables have no filter and no columns picker.
    expect(screen.queryByRole('button',{name:'Choose columns'})).toBeNull();
    expect(screen.queryByRole('button',{name:/^Filter/})).toBeNull();
    // Only the two "View all" links carry a customer filter (task U1).
    expect(screen.getAllByRole('link').map(l=>l.getAttribute('href')!).filter(h=>h.includes('customer='))).toEqual(['/rep/orders?customer=wasatch','/rep/quotes?customer=wasatch']);
  });

  it('shows the account facts, credit used, ship-to, the rep and the contacts',()=>{
    render(<CustomerDetail view={WASATCH_VIEW} supplierName="Herrick"/>);
    const account=within(card('Account'));
    expect(account.getAllByRole('term').map(t=>[t.textContent,t.nextElementSibling?.textContent])).toEqual([
      ['Terms','Net 30'],['Credit limit','$50,000.00'],['Open balance','$18,420.00'],['Past due','$0.00'],['Tax status','Taxable (UT)'],
      ['Quote win rate','71%17 of 24 decided quotes'],['Main phone','(801) 555-0148'],
    ]);
    expect(card('Account')).toHaveTextContent('Credit used: 37%');
    expect(account.getByRole('img',{name:'Credit used: 37% of $50,000.00'})).toBeInTheDocument();
    expect(card('Account')).toHaveTextContent('Ship-toWasatch Mechanical Contractors, main yard1800 W 10950 SSouth Jordan, UT 84095');
    expect(card('Rep')).toHaveTextContent('Brandi GallegosInside Sales(801) 111-2222brandi.gallegos@herrickindustrial.com');
    expect(within(card('Contacts')).getByText('1 contact')).toBeInTheDocument();
    expect(card('Contacts')).toHaveTextContent('Dana OrtizPRIMARYPurchasing(801) 555-0142dana.ortiz@wasatchmechanical.example');
    expect(document.body.textContent).not.toMatch(/cost|margin|\u2014/i);
  });

  it('a placeholder customer: no terms in the heading, and one-line empty states (C_CU3 "No orders yet")',()=>{
    render(<CustomerDetail view={GREAT_BASIN_VIEW} supplierName="Herrick"/>);
    expect(screen.getByText(', rep Brandi Gallegos',{exact:false})).toHaveTextContent(/^GBF-2207, rep Brandi Gallegos$/);
    expect(card('Account')).toHaveTextContent('Terms, credit and ship-to aren’t on file for Great Basin Fabrication yet.');
    expect(card('Contacts')).toHaveTextContent('No contacts on file.');
    expect(card('Recent orders')).toHaveTextContent('No orders yetOrders Great Basin Fabrication places with Herrick show up here, read-only from the ERP.');
    expect(card('Recent quotes')).toHaveTextContent('No quotes yet');
    expect(screen.queryByRole('link',{name:/View all/})).toBeNull();
    expect(screen.queryByRole('row')).toBeNull();
  });

  it('names a customer with no rep as such',()=>{
    render(<CustomerDetail view={{...GREAT_BASIN_VIEW,account:{...GREAT_BASIN_VIEW.account,rep:null}}} supplierName="Herrick"/>);
    expect(screen.getByText('GBF-2207',{exact:false}).parentElement).toHaveTextContent('GBF-2207, no rep assigned');
    expect(card('Rep')).toHaveTextContent('No rep is assigned to this customer.');
  });
});
