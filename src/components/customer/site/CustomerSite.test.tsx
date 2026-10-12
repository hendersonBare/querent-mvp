import {act,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import type {API} from '@/lib/contracts';
import {onOpenQuote} from '../open-quote';
import {emitQuotesChanged} from '../quotes-changed';
import {dana,fakeApi,notifications,NOW,orders,repContact,siteRoutes} from '../test-fixtures';
import {CustomerSite} from './CustomerSite';

// The logged-in customer site (plan U10; C_CVL1 to C_CVL5): the bell with its unread count, the
// account chip, and the box with Orders and My rep, which open side sheets. No contacts or quotes
// sidebars, no tabs, no ERP indicator, no Switch workspace.

afterEach(()=>{vi.useRealTimers();});

function renderSite({routes={},send=vi.fn(),signOut=vi.fn(),pollMs}:{routes?:Record<string,unknown>;send?:API['send'];signOut?:()=>void;pollMs?:number}={}){
  const api=fakeApi({...siteRoutes,...routes},send);
  render(<CustomerSite api={api} user={dana} signOut={signOut} now={NOW} pollMs={pollMs}><p>The box goes here</p></CustomerSite>);
  return {api,send,signOut};
}

describe('the frame around the box',()=>{
  it('has the bell, the account chip and the Orders and My rep buttons, and none of the old workspace',async()=>{
    renderSite();
    expect(screen.getByText('The box goes here')).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Notifications'})).toBeInTheDocument();
    const chip=screen.getByRole('button',{name:/Wasatch Mechanical Contractors/});
    expect(within(chip).getByText('WM')).toBeInTheDocument();
    expect(within(chip).getByText('Signed in')).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Orders'})).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'My rep'})).toBeInTheDocument();
    for(const gone of ['Contacts','Quotes'])expect(screen.queryByRole('complementary',{name:gone})).toBeNull();
    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.queryByRole('button',{name:'Switch workspace'})).toBeNull();
    expect(screen.queryByText(/via Querent|ERP|Last updated/)).toBeNull();
  });

  it('signs out from the account chip',async()=>{
    const {signOut}=renderSite();
    fireEvent.click(screen.getByRole('button',{name:/Wasatch Mechanical Contractors/}));
    fireEvent.click(await screen.findByRole('button',{name:'Sign out'}));
    expect(signOut).toHaveBeenCalled();
  });
});

describe('the bell',()=>{
  it('shows the unread count, and no badge when nothing is unread',async()=>{
    renderSite({routes:{'customer/notifications':notifications}});
    const bell=screen.getByRole('button',{name:'Notifications'});
    await waitFor(()=>expect(within(bell).getByText('2')).toBeInTheDocument());
  });

  it('shows no count when nothing is unread',async()=>{
    const {api}=renderSite();
    await waitFor(()=>expect(api.get).toHaveBeenCalledWith('customer/notifications'));
    expect(screen.getByRole('button',{name:'Notifications'}).textContent).toBe('');
  });

  it('opens a dropdown of short notifications: unread dot, title, one line, when',async()=>{
    renderSite({routes:{'customer/notifications':notifications}});
    await waitFor(()=>expect(within(screen.getByRole('button',{name:'Notifications'})).getByText('2')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button',{name:'Notifications'}));
    const panel=await screen.findByRole('dialog',{name:'Notifications'});
    expect(within(panel).getByText('Mark all read')).toBeInTheDocument();
    const rows=within(panel).getAllByRole('button',{name:/Q-24817|Q-24790|SO-51223/});
    expect(rows.map(r=>r.textContent)).toEqual([
      'Quote Q-24817 is ready to review$1,122.40. Brandi sent it today.Just now',
      'Brandi updated Q-24790The changes you asked for are in. Revision 2.2 h ago',
      'Order SO-51223 has shippedDelivery, SLC. From quote Q-24816.Yesterday',
    ]);
    expect(rows.map(r=>r.getAttribute('data-read'))).toEqual(['false','false','true']);
  });

  it('a quote notification marks itself read and opens the quote preview',async()=>{
    const send=vi.fn().mockResolvedValue({...notifications,unread:1,items:notifications.items.map((n,i)=>i===0?{...n,read:true}:n)});
    renderSite({routes:{'customer/notifications':notifications},send});
    const opened=vi.fn();
    const stop=onOpenQuote(opened);
    try{
      fireEvent.click(screen.getByRole('button',{name:'Notifications'}));
      fireEvent.click(await screen.findByRole('button',{name:/Quote Q-24817 is ready to review/}));
      expect(opened).toHaveBeenCalledWith({id:'q-24817',quote_number:'Q-24817'});
      expect(send).toHaveBeenCalledWith('customer/notifications/read','POST',{ids:['quote:q-24817:rev:1']});
      await waitFor(()=>expect(within(screen.getByRole('button',{name:'Notifications'})).getByText('1')).toBeInTheDocument());
      expect(screen.queryByRole('dialog',{name:'Notifications'})).toBeNull();
    }finally{stop();}
  });

  it('an order notification marks itself read and opens nothing; a read one sends nothing',async()=>{
    const send=vi.fn().mockResolvedValue(notifications);
    const unreadOrder={...notifications,unread:3,items:notifications.items.map(n=>n.quote?n:{...n,read:false})};
    renderSite({routes:{'customer/notifications':unreadOrder},send});
    const opened=vi.fn();
    const stop=onOpenQuote(opened);
    try{
      fireEvent.click(screen.getByRole('button',{name:'Notifications'}));
      fireEvent.click(await screen.findByRole('button',{name:/Order SO-51223 has shipped/}));
      expect(send).toHaveBeenCalledWith('customer/notifications/read','POST',{ids:['order:so-51223:shipped']});
      expect(opened).not.toHaveBeenCalled();
      // The answer has it read: pressing it again sends nothing.
      await waitFor(()=>expect(screen.getByRole('button',{name:/Order SO-51223 has shipped/})).toHaveAttribute('data-read','true'));
      fireEvent.click(screen.getByRole('button',{name:/Order SO-51223 has shipped/}));
      expect(send).toHaveBeenCalledTimes(1);
    }finally{stop();}
  });

  it('Mark all read clears the count',async()=>{
    const send=vi.fn().mockResolvedValue({unread:0,items:notifications.items.map(n=>({...n,read:true}))});
    renderSite({routes:{'customer/notifications':notifications},send});
    fireEvent.click(screen.getByRole('button',{name:'Notifications'}));
    fireEvent.click(await screen.findByRole('button',{name:'Mark all read'}));
    expect(send).toHaveBeenCalledWith('customer/notifications/read','POST',{all:true});
    await waitFor(()=>expect(screen.getAllByRole('button',{name:/Q-24817|Q-24790|SO-51223/}).map(r=>r.getAttribute('data-read'))).toEqual(['true','true','true']));
    expect(screen.getByRole('button',{name:'Notifications'}).textContent).toBe('');
  });

  it('says so in one line when there are none',async()=>{
    renderSite();
    fireEvent.click(screen.getByRole('button',{name:'Notifications'}));
    expect(await screen.findByText('No notifications yet.')).toBeInTheDocument();
  });

  it('polls like the rep badges, and reads again when a quote changes',async()=>{
    let current=siteRoutes['customer/notifications'];
    const {api}=renderSite({routes:{'customer/notifications':()=>current},pollMs:50});
    current=notifications;
    await waitFor(()=>expect(within(screen.getByRole('button',{name:'Notifications'})).getByText('2')).toBeInTheDocument());
    const calls=(api.get as ReturnType<typeof vi.fn>).mock.calls.length;
    current={...notifications,unread:1};
    act(()=>emitQuotesChanged());
    await waitFor(()=>expect((api.get as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(calls));
  });
});

describe('Orders',()=>{
  it('opens the Previous orders sheet: count, the first five, then Show N more',async()=>{
    renderSite();
    fireEvent.click(screen.getByRole('button',{name:'Orders'}));
    const sheet=await screen.findByRole('dialog',{name:'Previous orders'});
    expect(await within(sheet).findByText('SO-51223')).toBeInTheDocument();
    expect(within(sheet).getByText(String(orders.length))).toBeInTheDocument();
    const rows=sheet.querySelectorAll('[data-order]');
    expect([...rows].map(r=>r.textContent)).toEqual([
      'SO-51223Sep 9, 2026Delivery, SLC · From quote Q-24816$698.22Shipped',
      'SO-51222Aug 26, 2026Delivery, Provo · From quote Q-24814$304.23Closed',
      'SO-51221Aug 12, 2026Will call, SLC · From quote Q-24812$481.87Closed',
      'SO-51220Jul 29, 2026Delivery, SLC · From quote Q-24811$303.38Closed',
      'SO-51219Jul 15, 2026Will call, SLC$175.03Closed',
    ]);
    fireEvent.click(within(sheet).getByRole('button',{name:'Show 3 more'}));
    expect(sheet.querySelectorAll('[data-order]')).toHaveLength(8);
    expect(sheet.querySelectorAll('[data-order]')[5].textContent).toBe('SO-51218Jul 1, 2026Will call, SLC$203.45Open');
    expect(within(sheet).queryByRole('button',{name:/Show \d+ more/})).toBeNull();
  });

  it('closes with its x and with Escape',async()=>{
    renderSite();
    fireEvent.click(screen.getByRole('button',{name:'Orders'}));
    const sheet=await screen.findByRole('dialog',{name:'Previous orders'});
    fireEvent.click(within(sheet).getByRole('button',{name:'Close'}));
    expect(screen.queryByRole('dialog',{name:'Previous orders'})).toBeNull();
    fireEvent.click(screen.getByRole('button',{name:'Orders'}));
    await screen.findByRole('dialog',{name:'Previous orders'});
    fireEvent.keyDown(document,{key:'Escape'});
    expect(screen.queryByRole('dialog',{name:'Previous orders'})).toBeNull();
  });

  it('says so in one line when there are none',async()=>{
    renderSite({routes:{'customer/orders':[]}});
    fireEvent.click(screen.getByRole('button',{name:'Orders'}));
    expect(await screen.findByText('No orders yet.')).toBeInTheDocument();
  });
});

describe('My rep',()=>{
  it('opens the Your rep sheet: initials, name, title, phone and email',async()=>{
    renderSite();
    fireEvent.click(screen.getByRole('button',{name:'My rep'}));
    const sheet=await screen.findByRole('dialog',{name:'Your rep'});
    expect(await within(sheet).findByText('Brandi Gallegos')).toBeInTheDocument();
    for(const text of ['BG','Inside Sales',repContact.rep!.phone,repContact.rep!.email])expect(within(sheet).getByText(text)).toBeInTheDocument();
  });

  it('says so in one line when there is no rep',async()=>{
    renderSite({routes:{'customer/contacts':{rep:null}}});
    fireEvent.click(screen.getByRole('button',{name:'My rep'}));
    expect(await screen.findByText('No rep is assigned yet.')).toBeInTheDocument();
  });
});
