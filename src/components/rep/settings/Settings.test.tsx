import {fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {ALL_ON,FLAGS_OFF,FLAGS_ON,MANAGER_PROFILE,ORG_FLOORS,VIEW,rule,settingsFixture,table} from './test-fixtures';

// Settings (task 6.1; plan U8; C_S1 to C_S4): what each manager tab shows and what it sends to
// /api/rep/settings/*, and the feature-flagged sections (decision 48). A rep's own tabs (plan U9) are in
// RepSettings.test.tsx.

const nav=vi.hoisted(()=>({params:new URLSearchParams(),refresh:vi.fn()}));
vi.mock('next/navigation',()=>({
  useRouter:()=>({refresh:nav.refresh,replace:vi.fn(),push:vi.fn(),prefetch:vi.fn()}),
  useSearchParams:()=>nav.params,usePathname:()=>'/rep/settings',
}));

const {CustomerAccess}=await import('./CustomerAccess');
const {MarginFloors}=await import('./MarginFloors');
const {PricingDelivery}=await import('./PricingDelivery');
const {SettingsSection}=await import('../SettingsSection');

type Reply={status?:number;body:unknown};
let replies:Reply[]=[];
const fetchMock=vi.fn(async(_input:RequestInfo|URL,_init?:RequestInit)=>{
  const next=replies.shift()??{body:{detail:'Not found.'},status:404};
  return Response.json(next.body,{status:next.status??200});
});
const calls=()=>fetchMock.mock.calls.map(([url,init])=>({url:String(url),method:init?.method??'GET',body:init?.body?JSON.parse(String(init.body)):undefined}));
const sent=()=>calls().filter(c=>c.method==='PUT').map(({url,body})=>({url,body}));

beforeEach(()=>{replies=[];fetchMock.mockClear();nav.params=new URLSearchParams();vi.stubGlobal('fetch',fetchMock);});
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});

describe('Customer access (C_S1, C_S1a, C_S1b)',()=>{
  const renderIt=(props:Partial<Parameters<typeof CustomerAccess>[0]>={})=>render(<CustomerAccess initialRules={ALL_ON} initialTable={null} tabs={null} {...props}/>);

  it('with no search and no filter: one switch per data type for every customer, in the frame\'s words',()=>{
    renderIt();
    const card=screen.getByRole('region',{name:'Customer access'});
    expect(within(card).getAllByRole('switch').map(s=>[s.getAttribute('aria-label'),s.getAttribute('aria-checked')])).toEqual([
      ['Items and stock','true'],['Pricing','true'],['Orders and quotes','true'],['Account','true'],
    ]);
    expect(within(card).getAllByText('Querent answers')).toHaveLength(4);
    expect(screen.getByRole('searchbox',{name:'Search customers'})).toHaveValue('');
    expect(screen.getByRole('button',{name:'Filter'})).toBeInTheDocument();
    expect(screen.queryByText(/of 6 customers/)).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('turns a type off for every customer, and a mixed type reads "On for some customers" and turns on',async()=>{
    const off=[rule('items_stock',true),rule('pricing',false),rule('orders_quotes',true),rule('account',true)];
    replies=[{body:{customer_id:null,rules:off,all:off}}];
    renderIt();
    fireEvent.click(screen.getByRole('switch',{name:'Pricing'}));
    await waitFor(()=>expect(screen.getByRole('switch',{name:'Pricing'})).toHaveAttribute('aria-checked','false'));
    expect(sent()).toEqual([{url:'/api/rep/settings/access',body:{customer_id:null,category:'pricing',enabled:false}}]);
    expect(screen.getByRole('switch',{name:'Pricing'})).toHaveAccessibleDescription('Not shared');
  });

  it('a mixed type turns on for everyone',async()=>{
    replies=[{body:{customer_id:null,rules:ALL_ON,all:ALL_ON}}];
    renderIt({initialRules:[rule('items_stock',true),rule('pricing',null),rule('orders_quotes',true),rule('account',true)]});
    const pricing=screen.getByRole('switch',{name:'Pricing'});
    expect(pricing).toHaveAttribute('aria-checked','false');
    expect(pricing).toHaveAccessibleDescription('On for some customers');
    fireEvent.click(pricing);
    await waitFor(()=>expect(sent()).toEqual([{url:'/api/rep/settings/access',body:{customer_id:null,category:'pricing',enabled:true}}]));
  });

  it('a search lists the matching customers with their account numbers and one switch per type, and counts them',async()=>{
    replies=[{body:table('basin',['great-basin','weber-basin'])}];
    renderIt();
    fireEvent.change(screen.getByRole('searchbox',{name:'Search customers'}),{target:{value:'basin'}});
    await screen.findByText('2 of 6 customers');
    const grid=screen.getByRole('table',{name:'Customer access by customer'});
    expect(calls()).toEqual([{url:'/api/rep/settings/access?q=basin',method:'GET',body:undefined}]);
    expect(within(grid).getAllByRole('columnheader').map(h=>h.textContent)).toEqual([':: Customer',':: Items and stock',':: Pricing',':: Orders and quotes',':: Account']);
    expect(within(grid).getAllByRole('rowheader').map(h=>h.textContent)).toEqual(['Great Basin FabricationGBF-2207','Weber Basin FabricatorsWBF-6074']);
    expect(screen.getByRole('switch',{name:'Pricing for Great Basin Fabrication'})).toHaveAttribute('aria-checked','false');
    expect(screen.getByRole('switch',{name:'Pricing for Weber Basin Fabricators'})).toHaveAttribute('aria-checked','true');
    expect(screen.getByText('2 of 6 customers')).toBeInTheDocument();
    expect(screen.queryByRole('region',{name:'Customer access'})).not.toBeInTheDocument();
  });

  it('the filter (Any, Querent answers, Not shared per type) lists the customers that match, with the count badge; a switch sets one customer',async()=>{
    replies=[{body:table('',['great-basin','uinta-facility'])}];
    renderIt();
    fireEvent.click(screen.getByRole('button',{name:'Filter'}));
    const panel=screen.getByRole('dialog',{name:'Filter customers'});
    expect(within(panel).getAllByRole('radiogroup').map(g=>g.getAttribute('aria-labelledby')&&document.getElementById(g.getAttribute('aria-labelledby')!)!.textContent)).toEqual(['Items and stock','Pricing','Orders and quotes','Account']);
    const pricing=within(panel).getAllByRole('radiogroup')[1];
    expect(within(pricing).getAllByRole('radio').map(r=>r.textContent)).toEqual(['Any','Querent answers','Not shared']);
    fireEvent.click(within(pricing).getByRole('radio',{name:'Not shared'}));
    fireEvent.click(within(panel).getByRole('button',{name:'Apply filters'}));
    await screen.findByText('2 of 6 customers');
    expect(calls()).toEqual([{url:'/api/rep/settings/access?pricing=not_shared',method:'GET',body:undefined}]);
    expect(screen.getByRole('button',{name:'Filter, 1 applied'})).toHaveTextContent('Filter1');
    expect(screen.getByText('2 of 6 customers')).toBeInTheDocument();

    replies=[{body:{customer_id:'great-basin',rules:ALL_ON,all:ALL_ON}}];
    fireEvent.click(screen.getByRole('switch',{name:'Pricing for Great Basin Fabrication'}));
    await waitFor(()=>expect(screen.getByRole('switch',{name:'Pricing for Great Basin Fabrication'})).toHaveAttribute('aria-checked','true'));
    expect(sent()).toEqual([{url:'/api/rep/settings/access',body:{customer_id:'great-basin',category:'pricing',enabled:true}}]);

    // Clear all and Apply goes back to every customer's switches.
    fireEvent.click(screen.getByRole('button',{name:'Filter, 1 applied'}));
    fireEvent.click(within(screen.getByRole('dialog',{name:'Filter customers'})).getByRole('button',{name:'Clear all'}));
    fireEvent.click(within(screen.getByRole('dialog',{name:'Filter customers'})).getByRole('button',{name:'Apply filters'}));
    expect(await screen.findByRole('region',{name:'Customer access'})).toBeInTheDocument();
  });

  it('opens on a linked customer (?customer=) searched for its name, and says so when nothing matches',async()=>{
    renderIt({initialTable:table('Wasatch Mechanical Contractors',['wasatch'])});
    expect(screen.getByRole('searchbox',{name:'Search customers'})).toHaveValue('Wasatch Mechanical Contractors');
    expect(screen.getByRole('switch',{name:'Items and stock for Wasatch Mechanical Contractors'})).toBeInTheDocument();
    expect(screen.getByText('1 of 6 customers')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    replies=[{body:table('zz',[])}];
    fireEvent.change(screen.getByRole('searchbox',{name:'Search customers'}),{target:{value:'zz'}});
    expect(await screen.findByText('No customers match.')).toBeInTheDocument();
    expect(screen.getByText('0 of 6 customers')).toBeInTheDocument();
  });
});

describe('Margin floors (C_S2, C_S3)',()=>{
  const settings=settingsFixture();
  const renderIt=()=>render(<MarginFloors orgFloors={ORG_FLOORS} repMargins={settings.manager!.repMargins} meId="brandi" tabs={null}/>);

  it('Organization margin floors: a field and a 0% to 50% bar per category, saved together',async()=>{
    renderIt();
    const card=screen.getByRole('region',{name:'Organization margin floors'});
    expect(within(card).getAllByRole('textbox').map(f=>[f.getAttribute('aria-label'),(f as HTMLInputElement).value])).toEqual([
      ['Fasteners floor','20.0'],['Abrasives & Cutting floor','20.0'],['Safety & PPE floor','20.0'],['Material Handling & Tie-downs floor','20.0'],['Tools floor','18.0'],['Janitorial/MRO floor','20.0'],
    ]);
    expect(within(card).getByText(':: Category')).toBeInTheDocument();
    expect(within(card).getByText(':: Floor')).toBeInTheDocument();
    expect(['0%','25%','50%'].every(t=>within(card).getByText(t))).toBe(true);
    fireEvent.change(within(card).getByRole('textbox',{name:'Safety & PPE floor'}),{target:{value:'25'}});
    const saved=ORG_FLOORS.map(f=>f.category_id==='safety'?{...f,floor:0.25,label:'25.0%'}:f);
    replies=[{body:saved}];
    fireEvent.click(within(card).getByRole('button',{name:'Save floors'}));
    await waitFor(()=>expect(within(card).getByRole('status')).toHaveTextContent('Saved'));
    expect(sent()).toEqual([{url:'/api/rep/settings/org-floors',body:{floors:[
      {category_id:'fasteners',floor_pct:20},{category_id:'abrasives',floor_pct:20},{category_id:'safety',floor_pct:25},
      {category_id:'material-handling',floor_pct:20},{category_id:'tools',floor_pct:18},{category_id:'janitorial',floor_pct:20},
    ]}}]);
    expect(within(card).getByRole('textbox',{name:'Safety & PPE floor'})).toHaveValue('25.0');
  });

  it('says what a floor must be and will not save until each one is',()=>{
    renderIt();
    const card=screen.getByRole('region',{name:'Organization margin floors'});
    const field=within(card).getByRole('textbox',{name:'Tools floor'});
    for(const value of ['abc','100','-5','']){
      fireEvent.change(field,{target:{value}});
      expect(field).toHaveAttribute('aria-invalid','true');
      expect(within(card).getByRole('alert')).toHaveTextContent('Enter a floor from 0 to 99.9.');
      expect(within(card).getByRole('button',{name:'Save floors'})).toBeDisabled();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the server's reason when the floors aren't saved",async()=>{
    replies=[{status:403,body:{detail:'Manager access required.'}}];
    renderIt();
    const card=screen.getByRole('region',{name:'Organization margin floors'});
    fireEvent.change(within(card).getByRole('textbox',{name:'Tools floor'}),{target:{value:'19'}});
    fireEvent.click(within(card).getByRole('button',{name:'Save floors'}));
    expect(await within(card).findByRole('alert')).toHaveTextContent('Manager access required.');
  });

  it('Rep margins: read-only, a searchable rep (Eli first, not the signed-in manager), their margin against the organization floor',()=>{
    renderIt();
    const card=screen.getByRole('region',{name:'Rep margins'});
    expect(card).toHaveTextContent('Read-only. Each rep sets their own above your floors.');
    const box=within(card).getByRole('combobox',{name:'Rep'});
    expect(box).toHaveValue('Eli Porter');
    const grid=within(card).getByRole('table',{name:'Eli Porter’s margins'});
    expect(within(grid).getAllByRole('columnheader').map(h=>h.textContent)).toEqual([':: Category',':: Eli',':: Organization floor']);
    expect(within(grid).getAllByRole('row').slice(1).map(r=>r.textContent)).toEqual([
      'Fasteners22.0%20.0%','Abrasives & Cutting25.0%20.0%','Safety & PPE30.0%20.0%','Material Handling & Tie-downs20.0%20.0%','Tools18.0%18.0%','Janitorial/MRO21.0%20.0%',
    ]);
    expect(within(grid).queryByRole('textbox')).not.toBeInTheDocument();

    // Open: every rep, Eli picked (C_S3); typing narrows; picking shows that rep.
    fireEvent.click(box);
    const list=within(card).getByRole('listbox',{name:'Reps'});
    expect(within(list).getAllByRole('option').map(o=>[o.textContent,o.getAttribute('aria-selected')])).toEqual([
      ['Brandi Gallegos','false'],['Eli Porter','true'],['Mara Jensen','false'],['Nora Chen','false'],
    ]);
    fireEvent.change(box,{target:{value:'ma'}});
    expect(within(within(card).getByRole('listbox',{name:'Reps'})).getAllByRole('option').map(o=>o.textContent)).toEqual(['Mara Jensen']);
    fireEvent.mouseDown(within(card).getByRole('option',{name:'Mara Jensen'}));
    expect(within(card).queryByRole('listbox')).not.toBeInTheDocument();
    expect(box).toHaveValue('Mara Jensen');
    expect(within(card).getByRole('table',{name:'Mara Jensen’s margins'})).toHaveTextContent(':: Mara');
  });

  it('the rep list takes the arrow keys, Enter and Escape',()=>{
    renderIt();
    const box=within(screen.getByRole('region',{name:'Rep margins'})).getByRole('combobox',{name:'Rep'});
    fireEvent.keyDown(box,{key:'ArrowDown'});
    expect(screen.getByRole('listbox',{name:'Reps'})).toBeInTheDocument();
    fireEvent.keyDown(box,{key:'ArrowDown'});
    fireEvent.keyDown(box,{key:'Enter'});
    expect(box).toHaveValue('Mara Jensen');
    fireEvent.keyDown(box,{key:'ArrowDown'});
    fireEvent.keyDown(box,{key:'Escape'});
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});

describe('Pricing and delivery (C_S4)',()=>{
  const {pricing,delivery}=settingsFixture().manager!;
  const renderIt=(flags=FLAGS_OFF)=>render(<PricingDelivery pricing={pricing} delivery={delivery} flags={flags} tabs={null}/>);

  it('Pricing: the scarcity uplift (off by default) and the broken case rule, in the frame\'s words',async()=>{
    replies=[{body:{scarcity_uplift_enabled:true}}];
    renderIt();
    const card=screen.getByRole('region',{name:'Pricing'});
    expect(card).toHaveTextContent('How Querent suggests a price for each quote line.');
    expect(card).toHaveTextContent('Scarcity upliftWhen one branch can fill a line, or has under 1.5x the quantity on hand, suggest the customer price + 5%, never above list.Off (default)');
    expect(card).toHaveTextContent("Broken caseWhen a line's quantity is under a full case, suggest the customer price + 10%, never above list. A higher last-paid price still wins.Always on");
    expect(card).toHaveTextContent('Applies to quotes Querent prices from now on. Drafts already priced keep their suggestions.');
    const scarcity=within(card).getByRole('switch',{name:'Scarcity uplift'});
    expect(scarcity).toHaveAccessibleDescription('Off (default)');
    fireEvent.click(scarcity);
    await waitFor(()=>expect(scarcity).toHaveAttribute('aria-checked','true'));
    expect(sent()).toEqual([{url:'/api/rep/settings/pricing',body:{scarcity_uplift_enabled:true}}]);
    expect(scarcity).toHaveAccessibleDescription('On');
  });

  it('Delivery rates: right-aligned fields, units under the labels, the worked example follows the typing, Save sends all six',async()=>{
    renderIt();
    const card=screen.getByRole('region',{name:'Delivery rates'});
    expect(card).toHaveTextContent('Draft quotes use new rates from their next change.');
    const field=(name:string)=>within(card).getByRole('textbox',{name}) as HTMLInputElement;
    expect(['Base fee','Per road mile','Minimum charge','Free delivery at items total of','Delivery radius','Road miles per straight-line mile'].map(n=>field(n).value))
      .toEqual(['25','2.5','35','1500','75','1.25']);
    expect(card).toHaveTextContent('Delivery radiusMiles. Farther is call for freight');
    expect(card).toHaveTextContent('Road miles per straight-line mileMultiplier on straight-line miles');
    expect(card).toHaveTextContent('Minimum $35.00. Free with an items total of $1,500.00 or more, within 75 road miles. Example, 15.0 miles from SLC: $25.00 + $2.50/mi x 15.0 mi = $62.50. Sent quotes keep the freight they went out with.');
    fireEvent.change(field('Per road mile'),{target:{value:'3'}});
    expect(card).toHaveTextContent('$25.00 + $3.00/mi x 15.0 mi = $70.00');
    replies=[{body:{...delivery,per_mile:3}}];
    fireEvent.click(within(card).getByRole('button',{name:'Save rates'}));
    await waitFor(()=>expect(within(card).getByRole('status')).toHaveTextContent('Saved'));
    expect(sent()).toEqual([{url:'/api/rep/settings/delivery',body:{...delivery,per_mile:3}}]);
  });

  it('says what is wrong with a rate before saving, and the server\'s reason after',async()=>{
    renderIt();
    const card=screen.getByRole('region',{name:'Delivery rates'});
    fireEvent.change(within(card).getByRole('textbox',{name:'Delivery radius'}),{target:{value:'0'}});
    expect(within(card).getByRole('alert')).toHaveTextContent('Delivery radius must be from 1 to 1,000.');
    expect(within(card).getByRole('button',{name:'Save rates'})).toBeDisabled();
    fireEvent.change(within(card).getByRole('textbox',{name:'Delivery radius'}),{target:{value:'80'}});
    replies=[{status:403,body:{detail:'Manager access required.'}}];
    fireEvent.click(within(card).getByRole('button',{name:'Save rates'}));
    expect(await within(card).findByRole('alert')).toHaveTextContent('Manager access required.');
  });

  it('renders no feature-flagged section while its flag is off, and never loads them (decision 48)',()=>{
    renderIt(FLAGS_OFF);
    for(const name of ['Free delivery pricing','Recovery pool','Delivery cost model'])expect(screen.queryByRole('heading',{name})).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(document.body).not.toHaveTextContent(/FEATURE FLAG/i);
  });

  it('renders each flagged section when its own flag is on, and nothing more',async()=>{
    replies=[{body:VIEW}];
    const {unmount}=renderIt({...FLAGS_OFF,freeDeliveryPricing:true});
    expect(await screen.findByRole('heading',{name:'Free delivery pricing'})).toBeInTheDocument();
    expect(screen.queryByRole('heading',{name:'Recovery pool'})).not.toBeInTheDocument();
    expect(screen.queryByRole('heading',{name:'Delivery cost model'})).not.toBeInTheDocument();
    unmount();
    replies=[{body:VIEW}];
    renderIt({...FLAGS_ON,freeDeliveryPricing:false});
    expect(await screen.findByRole('heading',{name:'Recovery pool'})).toBeInTheDocument();
    expect(screen.getByRole('heading',{name:'Delivery cost model'})).toBeInTheDocument();
    expect(screen.queryByRole('heading',{name:'Free delivery pricing'})).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/FEATURE FLAG/i);
  });
});

describe('the Settings page (plan U8)',()=>{
  const tabs=()=>screen.getByRole('navigation',{name:'Settings sections'});

  it('gives the manager four tabs, Customer access first, then her own Profile (decision 69), and no Data sources',()=>{
    render(<SettingsSection initial={settingsFixture()}/>);
    expect(screen.getByRole('heading',{level:1,name:'Settings'})).toBeInTheDocument();
    expect(within(tabs()).getAllByRole('link').map(l=>[l.textContent,l.getAttribute('href')])).toEqual([
      ['Customer access','/rep/settings?tab=access'],['Margin floors','/rep/settings?tab=floors'],['Pricing and delivery','/rep/settings?tab=pricing'],['Aging','/rep/settings?tab=aging'],['Profile','/rep/settings?tab=profile'],
    ]);
    expect(within(tabs()).getByRole('link',{name:'Customer access'})).toHaveAttribute('aria-current','page');
    expect(screen.getByRole('region',{name:'Customer access'})).toBeInTheDocument();
    expect(screen.queryByText(/Data sources/)).not.toBeInTheDocument();
  });

  it('opens the tab in ?tab=, and Customer access for anything else (a rep-only tab included)',()=>{
    for(const [tab,heading] of [['floors','Organization margin floors'],['pricing','Delivery rates'],['aging','Aging thresholds'],['profile','Profile'],['sources','Customer access'],['reps','Customer access'],['margins','Customer access'],['notifications','Customer access']] as const){
      nav.params=new URLSearchParams({tab});
      const {unmount}=render(<SettingsSection initial={settingsFixture()}/>);
      expect(screen.getByRole('heading',{name:heading})).toBeInTheDocument();
      unmount();
    }
  });

  it("gives the manager her own Profile (decision 69; C_RS2, the rep's component): her picture, name, phone and email, saved through her own profile route",async()=>{
    nav.params=new URLSearchParams({tab:'profile'});
    render(<SettingsSection initial={settingsFixture()}/>);
    expect(within(tabs()).getByRole('link',{name:'Profile'})).toHaveAttribute('aria-current','page');
    const card=screen.getByRole('region',{name:'Profile'});
    expect(within(card).getByText('BG',{exact:true})).toBeInTheDocument();
    expect(within(card).getByRole('textbox',{name:'Name'})).toHaveValue('Brandi Gallegos');
    expect(within(card).getByRole('textbox',{name:'Phone'})).toHaveValue('(801) 111-2222');
    expect(within(card).getByRole('textbox',{name:'Email'})).toHaveValue('brandi.gallegos@herrickindustrial.com');
    expect(screen.queryByRole('region',{name:'Your margins'})).not.toBeInTheDocument();
    expect(screen.queryByRole('region',{name:'Needs attention'})).not.toBeInTheDocument();
    fireEvent.change(within(card).getByRole('textbox',{name:'Phone'}),{target:{value:'(801) 555-0142'}});
    replies=[{body:{...MANAGER_PROFILE,phone:'(801) 555-0142'}}];
    fireEvent.click(within(card).getByRole('button',{name:'Save profile'}));
    await waitFor(()=>expect(within(card).getByRole('status')).toHaveTextContent('Saved'));
    expect(sent()).toEqual([{url:'/api/rep/profile',body:{name:'Brandi Gallegos',phone:'(801) 555-0142',email:'brandi.gallegos@herrickindustrial.com'}}]);
  });

  it("gives a rep their own three tabs, not the manager's (plan U9; RepSettings.test.tsx covers them)",()=>{
    nav.params=new URLSearchParams({tab:'access'});
    render(<SettingsSection initial={settingsFixture({manager:false})}/>);
    expect(within(tabs()).getAllByRole('link').map(l=>l.textContent)).toEqual(['Margins','Profile','Notifications']);
    for(const name of ['Customer access','Organization margin floors','Rep margins','Delivery rates','Aging thresholds'])expect(screen.queryByRole('heading',{name})).not.toBeInTheDocument();
  });
});
