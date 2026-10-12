import {fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {AGING} from './test-fixtures';

// The manager's Settings cards (v3 spec §6 Settings; decision 16; task D1): Aging thresholds (six hours,
// one Save), saved through its route, keeping what the server stored. Reps (active flags) moved to Teams
// and Reps in plan U7 (src/components/rep/teams/TeamsAndReps.test.tsx).

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

describe('Aging thresholds',()=>{
  const field=(name:string)=>screen.getByRole('spinbutton',{name});

  it('shows amber and red hours for Ready for review, Changes requested and Sent, from the stored values',()=>{
    render(<AgingSettings aging={AGING} onSaved={vi.fn()}/>);
    expect(screen.getByRole('heading',{name:'Aging thresholds'})).toBeInTheDocument();
    const rows=within(screen.getByRole('table')).getAllByRole('rowheader').map(r=>within(r).getByText(/^(Ready for review|Changes requested|Sent)$/).textContent);
    expect(rows).toEqual(['Ready for review','Changes requested','Sent']);
    expect([field('Ready for review amber hours'),field('Ready for review red hours'),field('Changes requested amber hours'),field('Changes requested red hours'),field('Sent amber hours'),field('Sent red hours')].map(f=>(f as HTMLInputElement).value))
      .toEqual(['4','24','4','24','72','168']);
    expect(screen.getByText('3 days')).toBeInTheDocument();
    expect(screen.getByText('7 days')).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Save thresholds'})).toBeDisabled();
  });

  it('saves all six with one Save, and keeps what the server stored',async()=>{
    const stored={...AGING,rfrAmberH:2,sentRedH:120};
    replies=[{body:stored}];
    const onSaved=vi.fn();
    render(<AgingSettings aging={AGING} onSaved={onSaved}/>);
    fireEvent.change(field('Ready for review amber hours'),{target:{value:'2'}});
    fireEvent.change(field('Sent red hours'),{target:{value:'120'}});
    fireEvent.click(screen.getByRole('button',{name:'Save thresholds'}));
    await waitFor(()=>expect(onSaved).toHaveBeenCalledWith(stored));
    expect(sent()).toEqual([{url:'/api/rep/settings/aging',body:stored}]);
    expect(await screen.findByText('Saved')).toBeInTheDocument();
  });

  it('says what is wrong and will not save amber at or after red, or a fraction',()=>{
    render(<AgingSettings aging={AGING} onSaved={vi.fn()}/>);
    fireEvent.change(field('Changes requested amber hours'),{target:{value:'24'}});
    expect(screen.getByRole('alert')).toHaveTextContent('Changes requested: amber must come before red.');
    expect(screen.getByRole('button',{name:'Save thresholds'})).toBeDisabled();
    fireEvent.change(field('Changes requested amber hours'),{target:{value:'1.5'}});
    expect(screen.getByRole('alert')).toHaveTextContent('Enter whole hours for Changes requested amber.');
    fireEvent.click(screen.getByRole('button',{name:'Cancel'}));
    expect((field('Changes requested amber hours') as HTMLInputElement).value).toBe('4');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(sent()).toEqual([]);
  });

  it("shows the server's reason when the save is refused",async()=>{
    replies=[{status:403,body:{detail:'Manager access required.'}}];
    const onSaved=vi.fn();
    render(<AgingSettings aging={AGING} onSaved={onSaved}/>);
    fireEvent.change(field('Sent amber hours'),{target:{value:'48'}});
    fireEvent.click(screen.getByRole('button',{name:'Save thresholds'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('Manager access required.');
    expect(onSaved).not.toHaveBeenCalled();
  });
});
