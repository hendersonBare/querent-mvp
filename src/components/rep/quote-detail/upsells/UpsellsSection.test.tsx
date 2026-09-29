import type {AnchorHTMLAttributes,ReactNode} from 'react';
import {fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {QuoteDetail} from '@/server/rep/quote-detail';
import type {RepUpsell} from '@/server/rep/quote-upsells';
import {applyPatch,type DetailLine} from '@/server/rep/quote-math';
import {CUSTOMERS} from '../../quotes/test-fixtures';
import {SAMPLE_LINES,sampleDetail} from '../test-fixtures';
import {SAMPLE_UPSELLS,upsellLine} from './test-fixtures';
import {chipFigures,openUpsells,upsellsMeta} from './upsell-view';

// "Suggested by Querent" on the quote detail (task 3.6; spec §4, §5.5; mockup .sugbox): the
// collapsed row with "Querent found" and the ideas, the chips, and taking one: the line is added
// or the qty bumped, the totals and "Querent found" follow, the chip goes, and Undo brings it all
// back. fetch is a small fake of the rep API: the upsells list answers the chips that still apply
// to the lines, as the server's rules would for these five.

vi.mock('next/navigation',()=>({
  usePathname:()=>'/rep/quotes/Q-24817',
  useSearchParams:()=>new URLSearchParams('customer=wasatch'),
  useRouter:()=>({replace:vi.fn(),push:vi.fn(),refresh:vi.fn(),prefetch:vi.fn()}),
}));
vi.mock('next/link',()=>({default:({href,children,prefetch:_prefetch,...rest}:AnchorHTMLAttributes<HTMLAnchorElement>&{href:string;prefetch?:boolean;children?:ReactNode})=><a href={href} {...rest}>{children}</a>}));

const {RepShell}=await import('../../RepShell');
const {QuoteDetailView}=await import('../QuoteDetailView');

// ---- A fake rep API over one quote ----
let server:{lines:DetailLine[];upsells:number;changed:boolean};
const detailOf=(lines:DetailLine[])=>sampleDetail({lines});
/** The chips that still apply to the stored lines (the rules would drop the others). */
const stillApply=(lines:DetailLine[])=>SAMPLE_UPSELLS.filter(u=>u.action.type==='add_line'?!lines.some(l=>l.item_id===u.item.sku)
  :lines.find(l=>l.id===(u.action as {line_id:string}).line_id)?.qty===(u.action as {from_qty:number}).from_qty);
const fetchMock=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=String(input),method=init?.method??'GET';
  const body=init?.body?JSON.parse(String(init.body)):undefined;
  if(url==='/api/rep/badges')return Response.json({quotes:0});
  if(url==='/api/rep/quotes/q-24817/read')return Response.json({id:'q-24817',quote_number:'Q-24817',unread:false});
  if(url==='/api/rep/quotes/q-24817/upsells'&&method==='GET'){
    if(server.upsells!==200)return Response.json({detail:'Something went wrong.'},{status:server.upsells});
    return Response.json({quote_id:'q-24817',editable:true,upsells:stillApply(server.lines)});
  }
  if(url==='/api/rep/quotes/q-24817/upsells'&&method==='POST'){
    const chip=stillApply(server.lines).find(u=>u.id===body.upsellId);
    if(!chip)return Response.json({detail:'That suggestion no longer applies to Q-24817.',code:'conflict'},{status:409});
    if(server.changed||body.fingerprint!==chip.fingerprint)
      return Response.json({detail:'That suggestion changed since it was shown. Check the updated suggestions and try again.',code:'conflict'},{status:409});
    let lineId:string;
    if(chip.action.type==='add_line'){
      const added=upsellLine(chip,Math.max(...server.lines.map(l=>l.line_no))+1);
      server.lines=[...server.lines,added];
      lineId=added.id;
    }else{
      const {line_id,to_qty}=chip.action;
      server.lines=server.lines.map(l=>l.id===line_id?applyPatch(l,{qty:to_qty})!:l);
      lineId=line_id;
    }
    return Response.json({detail:detailOf(server.lines),upsell_id:chip.id,line_id:lineId});
  }
  const line=/^\/api\/rep\/quotes\/q-24817\/lines\/([^/]+)$/.exec(url);
  if(line&&method==='PATCH'){server.lines=server.lines.map(l=>l.id===line[1]?applyPatch(l,body)!:l);return Response.json(detailOf(server.lines));}
  if(line&&method==='DELETE'){server.lines=server.lines.filter(l=>l.id!==line[1]);return Response.json(detailOf(server.lines));}
  if(url==='/api/rep/quotes/q-24817')return Response.json(detailOf(server.lines));
  return Response.json({detail:'Not found.'},{status:404});
});
const calls=(method:string,match:RegExp)=>fetchMock.mock.calls.filter(([url,init])=>(init?.method??'GET')===method&&match.test(String(url)));

beforeEach(()=>{server={lines:[...SAMPLE_LINES],upsells:200,changed:false};fetchMock.mockClear();vi.stubGlobal('fetch',fetchMock);});
afterEach(()=>{vi.unstubAllGlobals();});

function renderPage(detail:QuoteDetail=sampleDetail()){
  return render(<RepShell rep={{id:'brandi',name:'Brandi Gallegos',initials:'BG',title:'Inside Sales'}} org="Herrick Industrial Supply" customers={CUSTOMERS}
    initialBadges={{quotes:0}}><QuoteDetailView initial={detail}/></RepShell>);
}
const section=()=>screen.getByRole('group',{name:'Suggested by Querent'}) as HTMLDetailsElement;
const chipTitles=()=>within(section()).queryAllByRole('listitem').map(li=>li.querySelector('p')!.textContent);
const totalsText=()=>screen.getByLabelText('Quote totals').textContent;
const loaded=(ideas:string)=>waitFor(()=>expect(section().querySelector('summary')).toHaveTextContent(ideas));
async function openSection(){
  renderPage();
  await loaded('5 ideas · up to +$162.95 gross profit');
  fireEvent.click(section().querySelector('summary')!);
  expect(section().open).toBe(true);
}

describe('the section',()=>{
  it('starts collapsed, as in the mockup: "Querent found", then the ideas once they load',async()=>{
    renderPage();
    expect(section().open).toBe(false);
    const summary=section().querySelector('summary')!;
    expect(summary).toHaveTextContent('Suggested by QuerentQuerent found +$11.50 GP');
    expect(summary).toHaveTextContent('Looking for ideas…');
    await loaded('5 ideas · up to +$162.95 gross profit');
    expect(calls('GET',/\/upsells$/)).toHaveLength(1);
  });

  it('opens to the five chips: wording, SKU, qty, price, margin and GP, each with one button',async()=>{
    await openSection();
    expect(chipTitles()).toEqual(SAMPLE_UPSELLS.map(u=>u.wording.title));
    const [nut]=within(section()).getAllByRole('listitem');
    expect(nut).toHaveTextContent('Matches the 1/2-13 Grade 8 bolts: 5 boxes of 100 cover all 500.');
    expect(nut).toHaveTextContent('HN-12-13-G8 · 5 at $18.15 · 46.0% margin · +$41.75 GP');
    expect(within(section()).getAllByRole('button').map(b=>b.getAttribute('aria-label'))).toEqual([
      'Add: Hex nut 1/2-13, Grade 8, yellow zinc (box of 100)','Add: Flap disc 4.5 in, 60 grit zirconia (box of 10)',
      'Add: Flat washer 1/2 in, Grade 8, yellow zinc (box of 100)','Apply: Bump cut-off wheels to 8 boxes (2 full cases)','Add: Safety glasses, clear anti-fog (box of 12)',
    ]);
    expect(within(section()).getByRole('button',{name:/^Apply: Bump cut-off wheels/})).toHaveTextContent('Apply');
    expect(section()).toHaveTextContent('CW-45-045-T1 · 6 → 8 at $36.00 · 33.1% margin · +$23.80 GP');
  });

  it('says so when the ideas can\'t load, and offers none',async()=>{
    server.upsells=500;
    renderPage();
    await waitFor(()=>expect(section().querySelector('summary')).toHaveTextContent('Suggestions aren’t available right now'));
    expect(within(section()).queryAllByRole('listitem')).toEqual([]);
  });

  it('offers no chips on a quote that can\'t be edited, and doesn\'t ask for them; "Querent found" stays',()=>{
    renderPage(sampleDetail({editable:false,quote:{status:'sent',revision:1}}));
    const box=screen.getByRole('region',{name:'Suggested by Querent'});
    expect(box).toHaveTextContent('Suggested by QuerentQuerent found +$11.50 GP');
    expect(box).toHaveTextContent('Offered while the quote can be edited');
    expect(within(box).queryAllByRole('button')).toEqual([]);
    expect(calls('GET',/\/upsells$/)).toHaveLength(0);
  });
});

describe('taking a chip',()=>{
  it('adds the nut: the line arrives as Suggested, the totals and "Querent found" follow, the chip goes',async()=>{
    await openSection();
    expect(totalsText()).toContain('Items$1,122.40');
    fireEvent.click(within(section()).getByRole('button',{name:/^Add: Hex nut/}));
    expect(within(section()).getByRole('button',{name:/^Add: Hex nut/})).toHaveTextContent('Adding…');
    await waitFor(()=>expect(screen.getByRole('rowheader',{name:/HN-12-13-G8/})).toBeInTheDocument());
    expect(JSON.parse(String(calls('POST',/\/upsells$/)[0][1]!.body))).toEqual({upsellId:'matching_fastener:HN-12-13-G8',fingerprint:'matching_fastener:HN-12-13-G8|add 5|18.15'});
    expect(screen.getByRole('rowheader',{name:/HN-12-13-G8/})).toHaveTextContent('Suggested');
    // 5 x $18.15 = $90.75 more. Querent found: the nut's broken-case price (customer + 10%) over its customer price, (18.15 - 16.50) x 5 = $8.25 more.
    expect(totalsText()).toContain('Items$1,213.15');
    expect(section().querySelector('summary')).toHaveTextContent('Querent found +$19.75 GP');
    expect(chipTitles()).not.toContain(SAMPLE_UPSELLS[0].wording.title);
    await loaded('4 ideas · up to +$121.20 gross profit');
    expect(screen.getByText('Added Hex nut 1/2-13 from Suggested by Querent')).toBeInTheDocument();
  });

  it('Undo removes the added line, and the chip and totals come back',async()=>{
    await openSection();
    fireEvent.click(within(section()).getByRole('button',{name:/^Add: Hex nut/}));
    await waitFor(()=>expect(screen.getByRole('button',{name:'Undo'})).toBeEnabled());
    await loaded('4 ideas');
    fireEvent.click(screen.getByRole('button',{name:'Undo'}));
    await waitFor(()=>expect(calls('DELETE',/lines\/q-24817-5$/)).toHaveLength(1));
    await waitFor(()=>expect(screen.queryByRole('rowheader',{name:/HN-12-13-G8/})).toBeNull());
    expect(totalsText()).toContain('Items$1,122.40');
    await loaded('5 ideas · up to +$162.95 gross profit');
    expect(section().querySelector('summary')).toHaveTextContent('Querent found +$11.50 GP');
    expect(chipTitles()[0]).toBe(SAMPLE_UPSELLS[0].wording.title);
  });

  it('applies the wheels bump at once (qty 8, totals up $72), and Undo puts qty 6 back on its contract price',async()=>{
    await openSection();
    fireEvent.click(within(section()).getByRole('button',{name:/^Apply: Bump cut-off wheels/}));
    expect(screen.getByRole('textbox',{name:'Quantity for CW-45-045-T1'})).toHaveValue('8');
    expect(totalsText()).toContain('Items$1,194.40');
    expect(chipTitles()).not.toContain('Bump cut-off wheels to 8 boxes (2 full cases)');
    await waitFor(()=>expect(calls('POST',/\/upsells$/)).toHaveLength(1));
    expect(JSON.parse(String(calls('POST',/\/upsells$/)[0][1]!.body))).toEqual({upsellId:'full_case:CW-45-045-T1',fingerprint:'full_case:CW-45-045-T1|q-24817-2 6->8|36.00'});
    await loaded('4 ideas · up to +$139.15 gross profit');
    // Contract lines add nothing to "Querent found" (spec §5.1).
    expect(section().querySelector('summary')).toHaveTextContent('Querent found +$11.50 GP');
    expect(screen.getByText('Changed qty on Cut-off wheel 4.5 x .045 x 7/8 in to 8 (Suggested by Querent)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Undo'}));
    expect(screen.getByRole('textbox',{name:'Quantity for CW-45-045-T1'})).toHaveValue('6');
    await waitFor(()=>expect(calls('PATCH',/lines\/q-24817-2$/)).toHaveLength(1));
    expect(JSON.parse(String(calls('PATCH',/lines/)[0][1]!.body))).toEqual({qty:6,basis:'contract'});
    await loaded('5 ideas · up to +$162.95 gross profit');
    expect(totalsText()).toContain('Items$1,122.40');
  });

  it('explains a chip the server refused as changed (409) next to the chips, and refreshes them and the quote',async()=>{
    await openSection();
    server.changed=true;
    const gets=calls('GET',/\/upsells$/).length;
    fireEvent.click(within(section()).getByRole('button',{name:/^Add: Safety glasses/}));
    await waitFor(()=>expect(within(section()).getByRole('alert')).toHaveTextContent('That suggestion changed since it was shown. Check the updated suggestions and try again.'));
    await waitFor(()=>expect(calls('GET',/\/quotes\/q-24817$/)).toHaveLength(1));
    await waitFor(()=>expect(calls('GET',/\/upsells$/).length).toBeGreaterThan(gets));
    // Not the grid's error bar, and nothing to undo.
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.queryByRole('button',{name:'Undo'})).toBeNull();
    expect(screen.queryByRole('rowheader',{name:/SG-CLR-AF/})).toBeNull();
    // Taking a chip again clears the note; Dismiss does too.
    server.changed=false;
    fireEvent.click(within(section()).getByRole('button',{name:/^Add: Safety glasses/}));
    expect(within(section()).queryByRole('alert')).toBeNull();
    await waitFor(()=>expect(screen.getByRole('rowheader',{name:/SG-CLR-AF/})).toBeInTheDocument());
  });

  it('lets the rep dismiss the note',async()=>{
    await openSection();
    server.changed=true;
    fireEvent.click(within(section()).getByRole('button',{name:/^Add: Flap disc/}));
    await waitFor(()=>expect(within(section()).getByRole('alert')).toBeInTheDocument());
    fireEvent.click(within(section()).getByRole('button',{name:'Dismiss'}));
    expect(within(section()).queryByRole('alert')).toBeNull();
  });
});

describe('what the section shows (pure)',()=>{
  const lines=SAMPLE_LINES;
  it('drops chips the lines already answer: the item on the quote, the bumped line changed or gone',()=>{
    expect(openUpsells(SAMPLE_UPSELLS,lines).map(u=>u.id)).toEqual(SAMPLE_UPSELLS.map(u=>u.id));
    const withNut=[...lines,upsellLine(SAMPLE_UPSELLS[0],5)];
    expect(openUpsells(SAMPLE_UPSELLS,withNut).map(u=>u.id)).not.toContain('matching_fastener:HN-12-13-G8');
    const wheelsAt7=lines.map(l=>l.id==='q-24817-2'?{...l,qty:7}:l);
    expect(openUpsells(SAMPLE_UPSELLS,wheelsAt7).map(u=>u.id)).not.toContain('full_case:CW-45-045-T1');
    // Without the bolts, the nut and washer they led to go too.
    expect(openUpsells(SAMPLE_UPSELLS,lines.filter(l=>l.id!=='q-24817-1')).map(u=>u.id)).toEqual(['bought_together:FD-45-60Z','full_case:CW-45-045-T1','bought_together:SG-CLR-AF']);
  });

  it('prints the figures and the header meta',()=>{
    expect(SAMPLE_UPSELLS.map(chipFigures)).toEqual(['5 at $18.15 · 46.0% margin','3 at $44.25 · 29.9% margin','5 at $14.25 · 48.1% margin','6 → 8 at $36.00 · 33.1% margin','2 at $29.90 · 39.1% margin']);
    const chips:RepUpsell[]=SAMPLE_UPSELLS;
    expect(upsellsMeta('ready',chips,true)).toBe('5 ideas · up to +$162.95 gross profit');
    expect(upsellsMeta('ready',chips.slice(0,1),true)).toBe('1 idea · up to +$41.75 gross profit');
    expect(upsellsMeta('ready',[],true)).toBe('No ideas for this quote');
    expect(upsellsMeta('loading',[],true)).toBe('Looking for ideas…');
    expect(upsellsMeta('error',[],true)).toBe('Suggestions aren’t available right now');
    expect(upsellsMeta('ready',chips,false)).toBe('Offered while the quote can be edited');
  });
});
