import {render,screen,within} from '@testing-library/react';
import {expect,it} from 'vitest';
import {ContactsSidebar} from './ContactsSidebar';
import {contacts,fakeApi} from './test-fixtures';

it('puts the assigned rep at the very top, above the departments',async()=>{
  const {container}=render(<ContactsSidebar api={fakeApi({'customer/contacts':contacts})}/>);
  const rep=await screen.findByRole('region',{name:'Your rep'});
  const departments=screen.getByRole('region',{name:'Herrick Industrial Supply'});
  expect(container.querySelector('section')).toBe(rep);
  expect(rep.compareDocumentPosition(departments)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(within(rep).getByText('Brandi Gallegos')).toBeInTheDocument();
  expect(within(rep).getByText('Inside Sales')).toBeInTheDocument();
  expect(within(rep).getByText('BG')).toBeInTheDocument();
  expect(within(rep).getByRole('link',{name:/\(801\) 111-2222/})).toHaveAttribute('href','tel:8011112222');
  expect(within(rep).getByRole('link',{name:/brandi\.gallegos@herrickindustrial\.com/})).toHaveAttribute('href','mailto:brandi.gallegos@herrickindustrial.com');
});

it('lists Customer Service, AR/Finance, then Warehouse / Will-call with one phone per branch',async()=>{
  render(<ContactsSidebar api={fakeApi({'customer/contacts':contacts})}/>);
  const departments=await screen.findByRole('region',{name:'Herrick Industrial Supply'});
  expect(within(departments).getAllByRole('heading',{level:3}).map(h=>h.textContent)).toEqual(['Customer Service','Accounts Receivable / Finance','Warehouse / Will-call']);
  expect(within(departments).getByRole('link',{name:/\(801\) 555-0110/})).toHaveAttribute('href','tel:8015550110');
  expect(within(departments).getByRole('link',{name:/ar@herrickindustrial\.com/})).toHaveAttribute('href','mailto:ar@herrickindustrial.com');
  const branches=within(within(departments).getByRole('list',{name:'Warehouse / Will-call by branch'})).getAllByRole('listitem');
  expect(branches.map(b=>b.textContent)).toEqual([
    expect.stringContaining('SLC'),expect.stringContaining('Ogden'),expect.stringContaining('Provo'),
  ]);
  expect(within(branches[0]).getByRole('link',{name:/\(801\) 555-0120/})).toHaveAttribute('href','tel:8015550120');
  expect(branches[0]).toHaveTextContent('Mon–Fri 6:30 AM–5:00 PM');
});

it('says so when no rep is assigned',async()=>{
  render(<ContactsSidebar api={fakeApi({'customer/contacts':{...contacts,rep:null}})}/>);
  expect(await screen.findByRole('region',{name:'Your rep'})).toHaveTextContent('No rep is assigned yet.');
});

it('shows a loading state, then an error instead of a permanent placeholder',async()=>{
  render(<ContactsSidebar api={fakeApi({'customer/contacts':()=>{throw new Error('Unable to load your contacts. Please try again.');}})}/>);
  expect(screen.getByRole('status')).toHaveTextContent('Loading contacts…');
  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load your contacts. Please try again.');
  expect(screen.queryByText('Loading contacts…')).not.toBeInTheDocument();
});
