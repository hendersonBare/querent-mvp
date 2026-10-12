import {act,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {ALL_PREFS,ORG_FLOORS,REP_PROFILE,settingsFixture} from './test-fixtures';

// A rep's Settings (plan U9; C_RS1 to C_RS4): Margins, Profile and Notifications, what each shows and what
// it sends. The manager keeps the U8 tabs (e2e and Settings.test.tsx).

const nav=vi.hoisted(()=>({params:new URLSearchParams(),refresh:vi.fn()}));
vi.mock('next/navigation',()=>({
  useRouter:()=>({refresh:nav.refresh,replace:vi.fn(),push:vi.fn(),prefetch:vi.fn()}),
  useSearchParams:()=>nav.params,usePathname:()=>'/rep/settings',
}));

const {SettingsSection}=await import('../SettingsSection');

type Reply={status?:number;body:unknown};
let replies:Reply[]=[];
const fetchMock=vi.fn(async(_input:RequestInfo|URL,_init?:RequestInit)=>{
  const next=replies.shift()??{body:{detail:'Not found.'},status:404};
  return Response.json(next.body,{status:next.status??200});
});
const calls=()=>fetchMock.mock.calls.map(([url,init])=>({url:String(url),method:init?.method??'GET',body:init?.body}));
const sent=()=>calls().filter(c=>c.method!=='GET').map(({url,method,body})=>({url,method,body:typeof body==='string'?JSON.parse(body):body}));

beforeEach(()=>{replies=[];fetchMock.mockClear();nav.refresh.mockClear();nav.params=new URLSearchParams();vi.stubGlobal('fetch',fetchMock);});
afterEach(()=>{vi.unstubAllGlobals();});

const MARA=settingsFixture({manager:false});
const open=(tab?:string)=>{nav.params=new URLSearchParams(tab?{tab}:{});return render(<SettingsSection initial={MARA}/>);};
const tabs=()=>screen.getByRole('navigation',{name:'Settings sections'});

describe("the rep's tabs",()=>{
  it('are Margins, Profile and Notifications, Margins first, and nothing of the manager\'s, whatever ?tab= says',()=>{
    for(const tab of [undefined,'access','floors','pricing','aging','sources']){
      const {unmount}=open(tab);
      expect(within(tabs()).getAllByRole('link').map(l=>[l.textContent,l.getAttribute('href')])).toEqual([
        ['Margins','/rep/settings?tab=margins'],['Profile','/rep/settings?tab=profile'],['Notifications','/rep/settings?tab=notifications'],
      ]);
      expect(within(tabs()).getByRole('link',{name:'Margins'})).toHaveAttribute('aria-current','page');
      expect(screen.getByRole('region',{name:'Your margins'})).toBeInTheDocument();
      for(const name of ['Customer access','Organization margin floors','Rep margins','Delivery rates','Aging thresholds','My margin floors'])expect(screen.queryByRole('heading',{name})).not.toBeInTheDocument();
      unmount();
    }
  });

  it('open from ?tab=profile and ?tab=notifications',()=>{
    let view=open('profile');
    expect(within(tabs()).getByRole('link',{name:'Profile'})).toHaveAttribute('aria-current','page');
    expect(screen.getByRole('region',{name:'Profile'})).toBeInTheDocument();
    view.unmount();
    view=open('notifications');
    expect(screen.getByRole('region',{name:'Needs attention'})).toBeInTheDocument();
    expect(screen.getByRole('region',{name:'Notifications'})).toBeInTheDocument();
    view.unmount();
  });
});

describe('Margins (C_RS1, C_RS3)',()=>{
  const card=()=>screen.getByRole('region',{name:'Your margins'});
  const field=(name:string)=>within(card()).getByRole('textbox',{name:`${name} margin`});
  const save=()=>within(card()).getByRole('button',{name:'Save margins'});

  it('shows each category with its bar, the rep\'s margin in a field, and the organization floor; the legend under it; no other words',()=>{
    open();
    expect(within(card()).getAllByRole('columnheader').map(h=>h.textContent)).toEqual([':: Category','0%25%50%',':: Your margin',':: Organization floor']);
    const rows=within(card()).getAllByRole('row').slice(1);
    expect(rows.map(r=>within(r).getByRole('rowheader').textContent)).toEqual(ORG_FLOORS.map(f=>f.category_name));
    expect(field('Fasteners')).toHaveValue('20.0');
    expect(rows.map(r=>within(r).getAllByRole('cell').at(-1)!.textContent)).toEqual(['20.0%','20.0%','20.0%','20.0%','18.0%','20.0%']);
    expect(card()).toHaveTextContent(/Organization floor, set by your managerYour margin$/);
    expect(save()).toBeEnabled();
  });

  it('turns a row red below its organization floor, names the real floor under it, and disables Save; back at the floor it clears',()=>{
    open();
    fireEvent.change(field('Tools'),{target:{value:'17.5'}});
    expect(field('Tools')).toHaveAttribute('aria-invalid','true');
    expect(within(card()).getByText('Below the 18.0% organization floor. Pick 18.0% or higher.')).toBeInTheDocument();
    expect(field('Tools')).toHaveAccessibleDescription('Below the 18.0% organization floor. Pick 18.0% or higher.');
    expect(save()).toBeDisabled();
    fireEvent.change(field('Fasteners'),{target:{value:'19.9'}});
    expect(within(card()).getByText('Below the 20.0% organization floor. Pick 20.0% or higher.')).toBeInTheDocument();
    fireEvent.change(field('Tools'),{target:{value:'18'}});
    fireEvent.change(field('Fasteners'),{target:{value:'20'}});
    expect(within(card()).queryByText(/organization floor\. Pick/)).not.toBeInTheDocument();
    expect(save()).toBeEnabled();
  });

  it('says what a margin must be and will not save until it is one',()=>{
    open();
    fireEvent.change(field('Safety & PPE'),{target:{value:'abc'}});
    expect(field('Safety & PPE')).toHaveAttribute('aria-invalid','true');
    expect(within(card()).getByRole('alert')).toHaveTextContent('Enter a margin from 0 to 99.9.');
    expect(save()).toBeDisabled();
  });

  it('saves the changed margins together through PUT /floors and keeps what the server stored',async()=>{
    open();
    fireEvent.change(field('Fasteners'),{target:{value:'24'}});
    fireEvent.change(field('Tools'),{target:{value:'22.46'}});
    const floors=MARA.mine.floors.map(f=>f.category_id==='fasteners'?{...f,margin_floor:0.24,label:'24.0%'}:f.category_id==='tools'?{...f,margin_floor:0.225,label:'22.5%'}:f);
    replies=[{body:{...MARA.mine,floors}}];
    fireEvent.click(save());
    await waitFor(()=>expect(within(card()).getByRole('status')).toHaveTextContent('Saved'));
    expect(sent()).toEqual([{url:'/api/rep/settings/floors',method:'PUT',body:{floors:[{category_id:'fasteners',floor_pct:24},{category_id:'tools',floor_pct:22.5}]}}]);
    expect(field('Tools')).toHaveValue('22.5');
  });

  it('sends nothing when nothing changed',async()=>{
    open();
    fireEvent.click(save());
    await act(async()=>{});
    expect(sent()).toEqual([]);
  });

  it('marks the field the server refuses (a floor raised meanwhile) with the floor the server names',async()=>{
    open();
    fireEvent.change(field('Safety & PPE'),{target:{value:'25'}});
    const detail='Below the 30.0% organization floor. Pick 30.0% or higher.';
    replies=[{status:400,body:{detail,code:'below_org_floor',fields:[{category_id:'safety',floor:0.3,detail}]}}];
    fireEvent.click(save());
    await waitFor(()=>expect(within(card()).getByText(detail)).toBeInTheDocument());
    expect(field('Safety & PPE')).toHaveAttribute('aria-invalid','true');
    const row=within(card()).getAllByRole('row').find(r=>within(r).queryByRole('rowheader')?.textContent==='Safety & PPE')!;
    expect(within(row).getAllByRole('cell').at(-2)!.textContent).toBe('30.0%');
    expect(save()).toBeDisabled();
  });
});

describe('Profile (C_RS2)',()=>{
  const card=()=>screen.getByRole('region',{name:'Profile'});
  const save=()=>within(card()).getByRole('button',{name:'Save profile'});

  it('shows the picture (initials until one is uploaded), name, phone and email, with no other words',()=>{
    open('profile');
    expect(within(card()).getByText('MJ')).toBeInTheDocument();
    expect(within(card()).getByText('Picture')).toBeInTheDocument();
    expect(within(card()).getByRole('button',{name:'Upload picture'})).toBeInTheDocument();
    expect(within(card()).getByRole('button',{name:'Remove'})).toBeInTheDocument();
    expect(within(card()).getByRole('textbox',{name:'Name'})).toHaveValue('Mara Jensen');
    expect(within(card()).getByRole('textbox',{name:'Phone'})).toHaveValue('(801) 555-0102');
    expect(within(card()).getByRole('textbox',{name:'Email'})).toHaveValue('mara.jensen@herrickindustrial.com');
    expect(card()).toHaveTextContent(/^ProfileSave profileMJPictureUpload pictureRemoveNamePhoneEmail$/);
  });

  it('saves the name, phone and email through PUT /api/rep/profile, then refreshes the page (the rail shows the name)',async()=>{
    open('profile');
    fireEvent.change(within(card()).getByRole('textbox',{name:'Phone'}),{target:{value:'(801) 555-0199'}});
    replies=[{body:{...REP_PROFILE,phone:'(801) 555-0199'}}];
    fireEvent.click(save());
    await waitFor(()=>expect(within(card()).getByRole('status')).toHaveTextContent('Saved'));
    expect(sent()).toEqual([{url:'/api/rep/profile',method:'PUT',body:{name:'Mara Jensen',phone:'(801) 555-0199',email:'mara.jensen@herrickindustrial.com'}}]);
    expect(nav.refresh).toHaveBeenCalled();
  });

  it("shows the server's reason on one red line and marks the field",async()=>{
    open('profile');
    fireEvent.change(within(card()).getByRole('textbox',{name:'Email'}),{target:{value:'mara'}});
    replies=[{status:400,body:{detail:'Enter an email address.',field:'email'}}];
    fireEvent.click(save());
    await waitFor(()=>expect(within(card()).getByRole('alert')).toHaveTextContent('Enter an email address.'));
    expect(within(card()).getByRole('textbox',{name:'Email'})).toHaveAttribute('aria-invalid','true');
  });

  it('takes a PNG, JPEG or WebP picture of 2 MB or less, shows it, and uploads it with Save profile; anything else is refused at once',async()=>{
    const createObjectURL=vi.fn(()=>'blob:preview'),revokeObjectURL=vi.fn();
    vi.stubGlobal('URL',Object.assign(URL,{createObjectURL,revokeObjectURL}));
    open('profile');
    const input=card().querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.accept).toBe('image/png,image/jpeg,image/webp');
    fireEvent.change(input,{target:{files:[new File(['<svg/>'],'me.svg',{type:'image/svg+xml'})]}});
    expect(within(card()).getByRole('alert')).toHaveTextContent('Pick a PNG, JPEG or WebP picture.');
    const big=new File([new Uint8Array(2*1024*1024+1)],'me.png',{type:'image/png'});
    fireEvent.change(input,{target:{files:[big]}});
    expect(within(card()).getByRole('alert')).toHaveTextContent('Pick a picture of 2 MB or less.');
    const png=new File([new Uint8Array([0x89,0x50,0x4e,0x47])],'me.png',{type:'image/png'});
    fireEvent.change(input,{target:{files:[png]}});
    expect(within(card()).queryByRole('alert')).not.toBeInTheDocument();
    expect(within(card()).getByRole('img',{name:'Mara Jensen'})).toHaveAttribute('src','blob:preview');
    replies=[{body:{...REP_PROFILE,picture_url:'/api/rep/profile/picture?v=1'}},{body:{...REP_PROFILE,picture_url:'/api/rep/profile/picture?v=1'}}];
    fireEvent.click(save());
    await waitFor(()=>expect(within(card()).getByRole('status')).toHaveTextContent('Saved'));
    expect(calls().filter(c=>c.method!=='GET').map(c=>[c.url,c.method])).toEqual([['/api/rep/profile/picture','PUT'],['/api/rep/profile','PUT']]);
    expect(calls()[0].body).toBe(png);
    expect(within(card()).getByRole('img',{name:'Mara Jensen'})).toHaveAttribute('src','/api/rep/profile/picture?v=1');
  });

  it('Remove takes the picture away with Save profile (DELETE), back to the initials',async()=>{
    const initial=settingsFixture({manager:false,picture:'/api/rep/profile/picture?v=1'});
    nav.params=new URLSearchParams({tab:'profile'});
    render(<SettingsSection initial={initial}/>);
    expect(within(card()).getByRole('img',{name:'Mara Jensen'})).toHaveAttribute('src','/api/rep/profile/picture?v=1');
    fireEvent.click(within(card()).getByRole('button',{name:'Remove'}));
    expect(within(card()).getByText('MJ')).toBeInTheDocument();
    replies=[{body:REP_PROFILE},{body:REP_PROFILE}];
    fireEvent.click(save());
    await waitFor(()=>expect(within(card()).getByRole('status')).toHaveTextContent('Saved'));
    expect(calls().filter(c=>c.method!=='GET').map(c=>[c.url,c.method])).toEqual([['/api/rep/profile/picture','DELETE'],['/api/rep/profile','PUT']]);
  });
});

describe('Notifications (C_RS4)',()=>{
  it("shows the caution's four switches and the bell's four, all on, in the frame's words",()=>{
    open('notifications');
    const attention=screen.getByRole('region',{name:'Needs attention'}),bell=screen.getByRole('region',{name:'Notifications'});
    expect(within(attention).getAllByRole('switch').map(s=>[s.getAttribute('aria-label'),s.getAttribute('aria-checked')])).toEqual(
      ['Quote overdue','Quote aging','Below margin floor','Change requested'].map(n=>[n,'true']));
    expect(within(bell).getAllByRole('switch').map(s=>[s.getAttribute('aria-label'),s.getAttribute('aria-checked')])).toEqual(
      ['Quote accepted','Quote declined','Quote expired','Customer chat needs a rep'].map(n=>[n,'true']));
    expect(attention).toHaveTextContent(/^Needs attentionSave notifications:: Needs attention:: In appQuote overdueQuote agingBelow margin floorChange requested$/);
    expect(bell).toHaveTextContent(/^NotificationsSave notifications:: Notifications:: In appQuote acceptedQuote declinedQuote expiredCustomer chat needs a rep$/);
  });

  it("each card saves its own switches through PUT /api/rep/notification-prefs",async()=>{
    open('notifications');
    const bell=screen.getByRole('region',{name:'Notifications'});
    fireEvent.click(within(bell).getByRole('switch',{name:'Quote declined'}));
    expect(within(bell).getByRole('switch',{name:'Quote declined'})).toHaveAttribute('aria-checked','false');
    replies=[{body:{...ALL_PREFS,quote_declined:false}}];
    fireEvent.click(within(bell).getByRole('button',{name:'Save notifications'}));
    await waitFor(()=>expect(within(bell).getByRole('status')).toHaveTextContent('Saved'));
    expect(sent()).toEqual([{url:'/api/rep/notification-prefs',method:'PUT',body:{quote_accepted:true,quote_declined:false,quote_expired:true,customer_chat_needs_rep:true}}]);
  });

  it("shows the server's reason when the switches are not saved",async()=>{
    open('notifications');
    const attention=screen.getByRole('region',{name:'Needs attention'});
    fireEvent.click(within(attention).getByRole('switch',{name:'Quote aging'}));
    replies=[{status:400,body:{detail:'Invalid setting.'}}];
    fireEvent.click(within(attention).getByRole('button',{name:'Save notifications'}));
    await waitFor(()=>expect(within(attention).getByRole('alert')).toHaveTextContent('Invalid setting.'));
  });
});
