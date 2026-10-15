import {fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {AGING} from './test-fixtures';

// Settings > Aging (v3 spec §6 Settings; decision 16; task D1; plan U8, C_S8): six hours, one Save on the
// title bar, saved through its route, keeping what the server stored. No descriptions; the "1 day" style
// conversions stay.

const {AgingSettings}=await import('./AgingSettings');

type Reply={status?:number;body:unknown};
let replies:Reply[]=[];
const fetchMock=vi.fn(async(_input:RequestInfo|URL,_init?:RequestInit)=>{
  const next=replies.shift()??{body:{detail:'Not found.'},status:404};
  return Response.json(next.body,{status:next.status??200});
});
const sent=()=>fetchMock.mock.calls.filter(([,init])=>init?.method==='PUT').map(([url,init])=>({url:String(url),body:JSON.parse(String(init!.body))}));

beforeEach(()=>{replies=[];fetchMock.mockClear();vi.stubGlobal('fetch',fetchMock);});
afterEach(()=>vi.unstubAllGlobals());

describe('Aging thresholds (C_S8)',()=>{
  const field=(name:string)=>screen.getByRole('textbox',{name});

  it('shows amber and red hours for Draft ready, Changes requested and Sent, with days beside whole days, and no descriptions',()=>{
    render(<AgingSettings aging={AGING} tabs={null}/>);
    const card=screen.getByRole('region',{name:'Aging thresholds'});
    const grid=within(card).getByRole('table',{name:'Aging thresholds'});
    expect(within(grid).getAllByRole('columnheader').map(h=>h.textContent)).toEqual([':: Status',':: Aging (amber) after',':: Overdue (red) after']);
    expect(within(grid).getAllByRole('rowheader').map(r=>r.textContent)).toEqual(['Draft ready','Changes requested','Sent']);
    expect([field('Draft ready amber hours'),field('Draft ready red hours'),field('Changes requested amber hours'),field('Changes requested red hours'),field('Sent amber hours'),field('Sent red hours')].map(f=>(f as HTMLInputElement).value))
      .toEqual(['4','24','4','24','72','168']);
    // C_S8: the red cells' conversions in their own 13px line; Sent's amber "3 days" inside its "h" unit, as the frame draws it.
    expect(within(grid).getAllByText('1 day')).toHaveLength(2);
    expect(within(grid).getByText('7 days')).toBeInTheDocument();
    expect(within(grid).getByText(/^h\s+3 days$/)).toBeInTheDocument();
    expect(card).not.toHaveTextContent(/From when|Wall-clock|header badge/);
    expect(within(card).getByRole('button',{name:'Save thresholds'})).toBeEnabled();
  });

  it('saves all six with one Save, and keeps what the server stored',async()=>{
    const stored={...AGING,rfrAmberH:2,sentRedH:120};
    replies=[{body:stored}];
    render(<AgingSettings aging={AGING} tabs={null}/>);
    fireEvent.change(field('Draft ready amber hours'),{target:{value:'2'}});
    fireEvent.change(field('Sent red hours'),{target:{value:'120'}});
    expect(screen.getByText('5 days')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Save thresholds'}));
    expect(await screen.findByText('Saved')).toBeInTheDocument();
    expect(sent()).toEqual([{url:'/api/rep/settings/aging',body:stored}]);
  });

  it('sends nothing when nothing changed',async()=>{
    render(<AgingSettings aging={AGING} tabs={null}/>);
    fireEvent.click(screen.getByRole('button',{name:'Save thresholds'}));
    await waitFor(()=>expect(sent()).toEqual([]));
  });

  it('says what is wrong and will not save amber at or after red, or a fraction',()=>{
    render(<AgingSettings aging={AGING} tabs={null}/>);
    fireEvent.change(field('Changes requested amber hours'),{target:{value:'24'}});
    expect(screen.getByRole('alert')).toHaveTextContent('Changes requested: amber must come before red.');
    expect(screen.getByRole('button',{name:'Save thresholds'})).toBeDisabled();
    fireEvent.change(field('Changes requested amber hours'),{target:{value:'1.5'}});
    expect(screen.getByRole('alert')).toHaveTextContent('Enter whole hours for Changes requested amber.');
    fireEvent.change(field('Changes requested amber hours'),{target:{value:'4'}});
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(sent()).toEqual([]);
  });

  it("shows the server's reason when the save is refused",async()=>{
    replies=[{status:403,body:{detail:'Manager access required.'}}];
    render(<AgingSettings aging={AGING} tabs={null}/>);
    fireEvent.change(field('Sent amber hours'),{target:{value:'48'}});
    fireEvent.click(screen.getByRole('button',{name:'Save thresholds'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('Manager access required.');
  });
});
