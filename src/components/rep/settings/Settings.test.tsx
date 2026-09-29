import {act,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {settingsFixture} from './test-fixtures';

// Settings tabs (task 6.1): what each shows and what it sends to /api/rep/settings/*.

const router=vi.hoisted(()=>({refresh:vi.fn()}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:router.refresh,replace:vi.fn(),push:vi.fn(),prefetch:vi.fn()})}));

const {RepAssignments}=await import('./RepAssignments');
const {CustomerAccess}=await import('./CustomerAccess');
const {MarginFloors}=await import('./MarginFloors');
const {PricingDelivery}=await import('./PricingDelivery');
const {DataSources}=await import('./DataSources');

type Reply={status?:number;body:unknown};
let replies:Reply[]=[];
const fetchMock=vi.fn(async(_input:RequestInfo|URL,_init?:RequestInit)=>{
  const next=replies.shift()??{body:{detail:'Not found.'},status:404};
  return Response.json(next.body,{status:next.status??200});
});
const sent=()=>fetchMock.mock.calls.filter(([,init])=>init?.method==='PUT').map(([url,init])=>({url:String(url),body:JSON.parse(String(init!.body))}));

beforeEach(()=>{replies=[];fetchMock.mockClear();router.refresh.mockClear();vi.stubGlobal('fetch',fetchMock);});
afterEach(()=>vi.unstubAllGlobals());

describe('Rep assignments',()=>{
  const settings=settingsFixture();
  const renderIt=(onChange=vi.fn())=>{render(<RepAssignments rows={settings.assignments} reps={settings.reps} repId="brandi" onChange={onChange}/>);return onChange;};

  it('lists every customer, placeholders marked, with a rep dropdown and their quotes by rep',()=>{
    renderIt();
    const rows=within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(rows.map(r=>within(r).getByRole('rowheader').textContent)).toEqual([
      'Canyon Ridge BuildersCRB-3318Placeholder','Great Basin FabricationGBF-2207Placeholder','Uinta Facility ServicesUFS-4051Placeholder','Wasatch Mechanical ContractorsWAS-1142',
    ]);
    const wasatch=screen.getByRole('combobox',{name:'Rep for Wasatch Mechanical Contractors'});
    expect(wasatch).toHaveValue('brandi');
    expect(within(wasatch).getAllByRole('option').map(o=>o.textContent)).toEqual(['Brandi Gallegos (you)','Eli Porter','Mara Jensen','Nora Chen']);
    expect(screen.getByRole('combobox',{name:'Rep for Canyon Ridge Builders'})).toHaveValue('mara');
    expect(rows[3]).toHaveTextContent('25 with Brandi Gallegos');
    expect(rows[0]).toHaveTextContent('None yet');
  });

  it("reassigns a customer, says its quotes stay put, and refreshes the picker's rep names",async()=>{
    const moved=settings.assignments.map(a=>a.id==='wasatch'?{...a,rep_id:'mara',rep_name:'Mara Jensen'}:a);
    replies=[{body:{assignments:moved}}];
    const onChange=renderIt();
    fireEvent.change(screen.getByRole('combobox',{name:'Rep for Wasatch Mechanical Contractors'}),{target:{value:'mara'}});
    await waitFor(()=>expect(onChange).toHaveBeenCalledWith(moved));
    expect(sent()).toEqual([{url:'/api/rep/settings/assignments',body:{customer_id:'wasatch',rep_id:'mara'}}]);
    expect(screen.getByRole('status')).toHaveTextContent('Wasatch Mechanical Contractors is now Mara Jensen’s customer. New quote requests go to Mara Jensen. Its 25 existing quotes stay with Brandi Gallegos.');
    expect(router.refresh).toHaveBeenCalled();
  });

  it("shows the server's reason when a change isn't saved",async()=>{
    replies=[{status:404,body:{detail:'Rep not found.'}}];
    const onChange=renderIt();
    fireEvent.change(screen.getByRole('combobox',{name:'Rep for Great Basin Fabrication'}),{target:{value:'eli'}});
    expect(await screen.findByRole('alert')).toHaveTextContent('Rep not found.');
    expect(onChange).not.toHaveBeenCalled();
    expect(router.refresh).not.toHaveBeenCalled();
  });
});

describe('Customer access',()=>{
  it("shows what each category covers, and turns one off for the picked customer",async()=>{
    const settings=settingsFixture('wasatch');
    const off={...settings.access,rules:settings.access.rules.map(r=>r.category==='items_stock'?{...r,enabled:false}:r)};
    replies=[{body:off}];
    const onChange=vi.fn();
    const {rerender}=render(<CustomerAccess access={settings.access} scopeLabel="Wasatch Mechanical Contractors" onChange={onChange}/>);
    expect(screen.getByText(/What Querent answers in chat for Wasatch Mechanical Contractors/)).toBeInTheDocument();
    expect(screen.getAllByRole('switch').map(s=>s.getAttribute('aria-label'))).toEqual(['Items & stock','Pricing','Orders & quotes','Account']);
    expect(screen.getByText('Finding items, stock by branch, and asking for a quote in chat')).toBeInTheDocument();
    const items=screen.getByRole('switch',{name:'Items & stock'});
    expect(items).toBeChecked();
    expect(items).toHaveAccessibleDescription('Querent answers');
    fireEvent.click(items);
    await waitFor(()=>expect(onChange).toHaveBeenCalledWith(off));
    expect(sent()).toEqual([{url:'/api/rep/settings/access',body:{customer_id:'wasatch',category:'items_stock',enabled:false}}]);
    rerender(<CustomerAccess access={off} scopeLabel="Wasatch Mechanical Contractors" onChange={onChange}/>);
    expect(screen.getByRole('switch',{name:'Items & stock'})).not.toBeChecked();
    expect(screen.getByRole('switch',{name:'Items & stock'})).toHaveAccessibleDescription('Off: chat refers them to Brandi Gallegos');
  });

  it('for All customers, sets every customer at once, and a mixed category reads as some-on and turns on',async()=>{
    const settings=settingsFixture();
    const mixed={...settings.access,rules:settings.access.rules.map(r=>r.category==='pricing'?{...r,enabled:null}:r)};
    replies=[{body:settings.access}];
    render(<CustomerAccess access={mixed} scopeLabel="All customers" onChange={vi.fn()}/>);
    expect(screen.getByText(/for every customer\. A change here applies to all of them/)).toBeInTheDocument();
    const pricing=screen.getByRole('switch',{name:'Pricing'});
    expect(pricing).not.toBeChecked();
    expect(pricing).toHaveAccessibleDescription('On for some customers');
    fireEvent.click(pricing);
    await waitFor(()=>expect(sent()).toEqual([{url:'/api/rep/settings/access',body:{customer_id:null,category:'pricing',enabled:true}}]));
  });
});

describe('Margin floors',()=>{
  const settings=settingsFixture();
  const renderIt=(onSaved=vi.fn())=>{render(<MarginFloors mine={settings.floors.mine} others={settings.floors.others} onSaved={onSaved}/>);return onSaved;};

  it("shows Brandi's floor per category to edit, and the other reps' read-only",()=>{
    renderIt();
    expect(screen.getByRole('heading',{name:'My margin floors'})).toBeInTheDocument();
    expect(screen.getByText(/like “Below Brandi’s 30% Safety & PPE floor”/)).toBeInTheDocument();
    expect(screen.getAllByRole('textbox').map(f=>[f.getAttribute('aria-label'),(f as HTMLInputElement).value])).toEqual([
      ['Fasteners floor','20.0'],['Abrasives & Cutting floor','25.0'],['Safety & PPE floor','30.0'],['Material Handling & Tie-downs floor','20.0'],['Tools floor','18.0'],['Janitorial/MRO floor','20.0'],
    ]);
    for(const save of screen.getAllByRole('button',{name:'Save'}))expect(save).toBeDisabled();
    const others=screen.getByRole('table');
    expect(within(others).getAllByRole('columnheader').map(h=>h.textContent)).toEqual(['Category','Eli Porter','Mara Jensen','Nora Chen']);
    expect(within(others).getAllByRole('row')[3]).toHaveTextContent(/^Safety & PPE20\.0%20\.0%20\.0%$/);
    expect(within(others).queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('saves a changed floor to 0.1 point and shows what the server stored',async()=>{
    const saved={...settings.floors.mine,floors:settings.floors.mine.floors.map(f=>f.category_id==='safety'?{...f,margin_floor:0.255,label:'25.5%'}:f)};
    replies=[{body:saved}];
    const onSaved=renderIt();
    const field=screen.getByRole('textbox',{name:'Safety & PPE floor'});
    fireEvent.change(field,{target:{value:'25.46'}});
    const row=field.closest('li')!;
    const save=within(row).getByRole('button',{name:'Save'});
    expect(save).toBeEnabled();
    fireEvent.click(save);
    await waitFor(()=>expect(onSaved).toHaveBeenCalledWith(saved));
    expect(sent()).toEqual([{url:'/api/rep/settings/floors',body:{rep_id:'brandi',category_id:'safety',floor_pct:25.5}}]);
    expect(field).toHaveValue('25.5');
    expect(within(row).getByRole('status')).toHaveTextContent('Saved');
  });

  it('says what a floor must be, and refuses to save until it is one',()=>{
    renderIt();
    const field=screen.getByRole('textbox',{name:'Fasteners floor'});
    for(const value of ['abc','100','-5','']){
      fireEvent.change(field,{target:{value}});
      expect(field).toHaveAttribute('aria-invalid','true');
      expect(field).toHaveAccessibleDescription('Enter a floor from 0 to 99.9.');
      expect(within(field.closest('li')!).getByRole('button',{name:'Save'})).toBeDisabled();
    }
    fireEvent.submit(field.closest('form')!);
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.change(field,{target:{value:'20'}});
    expect(field).not.toHaveAttribute('aria-invalid');
    expect(within(field.closest('li')!).getByRole('button',{name:'Save'})).toBeDisabled();
  });

  it("shows the server's reason when a floor isn't saved",async()=>{
    replies=[{status:400,body:{detail:'Enter a floor from 0% to 99.9%.'}}];
    const onSaved=renderIt();
    const field=screen.getByRole('textbox',{name:'Tools floor'});
    fireEvent.change(field,{target:{value:'22'}});
    fireEvent.submit(field.closest('form')!);
    await waitFor(()=>expect(field).toHaveAccessibleDescription('Enter a floor from 0% to 99.9%.'));
    expect(onSaved).not.toHaveBeenCalled();
    expect(field).toHaveValue('22');
  });
});

describe('Pricing & delivery',()=>{
  const settings=settingsFixture();

  it('turns the scarcity uplift on (it is off by default)',async()=>{
    replies=[{body:{scarcity_uplift_enabled:true}}];
    const onPricing=vi.fn();
    const {rerender}=render(<PricingDelivery pricing={settings.pricing} delivery={settings.delivery} onPricing={onPricing} onDelivery={vi.fn()}/>);
    const scarcity=screen.getByRole('switch',{name:'Scarcity uplift'});
    expect(scarcity).not.toBeChecked();
    expect(scarcity).toHaveAccessibleDescription('Off (default)');
    fireEvent.click(scarcity);
    await waitFor(()=>expect(onPricing).toHaveBeenCalledWith({scarcity_uplift_enabled:true}));
    expect(sent()).toEqual([{url:'/api/rep/settings/pricing',body:{scarcity_uplift_enabled:true}}]);
    rerender(<PricingDelivery pricing={{scarcity_uplift_enabled:true}} delivery={settings.delivery} onPricing={onPricing} onDelivery={vi.fn()}/>);
    expect(screen.getByRole('switch',{name:'Scarcity uplift'})).toBeChecked();
  });

  it('says how a broken case is priced (fixed at customer price + 10%)',()=>{
    render(<PricingDelivery pricing={settings.pricing} delivery={settings.delivery} onPricing={vi.fn()} onDelivery={vi.fn()}/>);
    const pricing=screen.getByRole('region',{name:'Pricing'});
    expect(pricing).toHaveTextContent('Broken caseWhen a line’s quantity is less than a full case, suggest the customer price + 10%, never above list. A higher last-paid price still wins.Always on');
    expect(within(pricing).getAllByRole('switch')).toHaveLength(1);
  });

  it('edits every delivery rate: a worked example follows the typing, and Save sends all six',async()=>{
    replies=[{body:{base_fee:30,per_mile:3.25,min_charge:40,free_threshold:2000,max_radius_miles:90,road_factor:1.3}}];
    const onDelivery=vi.fn();
    render(<PricingDelivery pricing={settings.pricing} delivery={settings.delivery} onPricing={vi.fn()} onDelivery={onDelivery}/>);
    const rates=screen.getByRole('region',{name:'Delivery rates'});
    const field=(name:string)=>within(rates).getByRole('spinbutton',{name});
    expect(['Base fee','Per road mile','Minimum charge','Free delivery at items total of','Delivery radius','Road miles per straight-line mile'].map(n=>(field(n) as HTMLInputElement).value))
      .toEqual(['25','2.5','35','1500','75','1.25']);
    expect(rates).toHaveTextContent('Example, 15.0 road miles from SLC: $25.00 + $2.50/mi × 15.0 mi = $62.50');
    const save=within(rates).getByRole('button',{name:'Save rates'});
    expect(save).toBeDisabled();
    fireEvent.change(field('Base fee'),{target:{value:'30'}});
    fireEvent.change(field('Per road mile'),{target:{value:'3.25'}});
    expect(rates).toHaveTextContent('Example, 15.0 road miles from SLC: $30.00 + $3.25/mi × 15.0 mi = $78.75');
    fireEvent.change(field('Minimum charge'),{target:{value:'40'}});
    fireEvent.change(field('Free delivery at items total of'),{target:{value:'2000'}});
    fireEvent.change(field('Delivery radius'),{target:{value:'90'}});
    fireEvent.change(field('Road miles per straight-line mile'),{target:{value:'1.3'}});
    fireEvent.click(save);
    await waitFor(()=>expect(onDelivery).toHaveBeenCalledWith({base_fee:30,per_mile:3.25,min_charge:40,free_threshold:2000,max_radius_miles:90,road_factor:1.3}));
    expect(sent()).toEqual([{url:'/api/rep/settings/delivery',body:{base_fee:30,per_mile:3.25,min_charge:40,free_threshold:2000,max_radius_miles:90,road_factor:1.3}}]);
  });

  it('says what is wrong before saving, and Cancel puts the saved rates back',()=>{
    render(<PricingDelivery pricing={settings.pricing} delivery={settings.delivery} onPricing={vi.fn()} onDelivery={vi.fn()}/>);
    const rates=screen.getByRole('region',{name:'Delivery rates'});
    const radius=within(rates).getByRole('spinbutton',{name:'Delivery radius'});
    fireEvent.change(radius,{target:{value:'0'}});
    expect(within(rates).getByRole('alert')).toHaveTextContent('Delivery radius must be from 1 to 1,000.');
    expect(within(rates).getByRole('button',{name:'Save rates'})).toBeDisabled();
    fireEvent.change(within(rates).getByRole('spinbutton',{name:'Road miles per straight-line mile'}),{target:{value:''}});
    fireEvent.click(within(rates).getByRole('button',{name:'Cancel'}));
    expect(radius).toHaveValue(75);
    expect(within(rates).queryByRole('alert')).not.toBeInTheDocument();
    expect(sent()).toEqual([]);
  });

  it("shows the server's reason when the rates aren't saved",async()=>{
    replies=[{status:400,body:{detail:'Base fee must be from 0 to 10,000.'}}];
    const onDelivery=vi.fn();
    render(<PricingDelivery pricing={settings.pricing} delivery={settings.delivery} onPricing={vi.fn()} onDelivery={onDelivery}/>);
    const rates=screen.getByRole('region',{name:'Delivery rates'});
    fireEvent.change(within(rates).getByRole('spinbutton',{name:'Base fee'}),{target:{value:'26'}});
    fireEvent.click(within(rates).getByRole('button',{name:'Save rates'}));
    await waitFor(()=>expect(within(rates).getByRole('alert')).toHaveTextContent('Base fee must be from 0 to 10,000.'));
    expect(onDelivery).not.toHaveBeenCalled();
  });
});

describe('Data sources',()=>{
  it('shows the demo database and the last sync, then keeps them fresh',async()=>{
    vi.useFakeTimers({shouldAdvanceTime:true,now:new Date('2026-09-27T02:43:31.000Z')});
    try{
      const settings=settingsFixture();
      replies=[{body:settings.sources}];
      render(<DataSources initial={settings.sources}/>);
      expect(screen.getByRole('heading',{name:'Demo database'})).toBeInTheDocument();
      expect(screen.getByText('Sep 23, 2026')).toBeInTheDocument();
      expect(screen.getByText('4 customers, 60 items, 180 orders, 25 quotes')).toBeInTheDocument();
      expect(screen.getByRole('heading',{name:'Herrick Industrial Supply ERP'})).toBeInTheDocument();
      expect(screen.getByText('Connected')).toBeInTheDocument();
      expect(screen.getByText(/^Last sync: ERP connection refreshed/)).toBeInTheDocument();
      expect(screen.getAllByRole('listitem')).toHaveLength(2);
      await waitFor(()=>expect(fetchMock).toHaveBeenCalledWith('/api/rep/settings/sources',{cache:'no-store'}));
      // Two minutes without a sync reads as delayed.
      replies=[{body:settings.sources}];
      await act(async()=>{vi.setSystemTime(new Date('2026-09-27T02:46:00.000Z'));await vi.advanceTimersByTimeAsync(5000);});
      expect(await screen.findByText('Update delayed')).toBeInTheDocument();
    }finally{vi.useRealTimers();}
  });
});
