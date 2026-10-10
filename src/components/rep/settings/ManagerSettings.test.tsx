import {fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {AGING,TEAM} from './test-fixtures';

// The manager's Settings cards (v3 spec §6 Settings; decisions 16, 20, 21; task D1): Aging
// thresholds (six hours, one Save) and Reps (team label, active; deactivation blocked while the rep
// has customers, never yourself). Each saves through its route and keeps what the server stored.

const {AgingSettings}=await import('./AgingSettings');
const {TeamReps}=await import('./TeamReps');

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

describe('Reps',()=>{
  const row=(name:string)=>screen.getByRole('row',{name:new RegExp(name)});
  const renderIt=(onChange=vi.fn(),reps=TEAM)=>{render(<TeamReps reps={reps} repId="brandi" onChange={onChange}/>);return onChange;};

  it('lists each rep with role, team label, customers and an active switch',()=>{
    renderIt();
    expect(screen.getByRole('heading',{name:'Reps'})).toBeInTheDocument();
    const rows=within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(rows.map(r=>within(r).getByRole('rowheader').textContent)).toEqual(['Brandi Gallegos (you)Inside Sales','Eli PorterOutside Sales','Mara JensenInside Sales','Nora ChenAccount Manager']);
    expect(within(row('Brandi Gallegos')).getByText('Manager')).toBeInTheDocument();
    expect(within(row('Eli Porter')).getByText('Rep')).toBeInTheDocument();
    expect(screen.getByRole('textbox',{name:'Team label for Eli Porter'})).toHaveValue('Outside Sales');
    expect(screen.getByRole('textbox',{name:'Team label for Eli Porter'})).toHaveAttribute('maxLength','40');
    expect(screen.getByRole('switch',{name:'Eli Porter active'})).toBeChecked();
    expect(screen.getByRole('switch',{name:'Eli Porter active'})).toBeEnabled();
  });

  it('blocks deactivating a rep who still has customers, and yourself, and says why',()=>{
    renderIt();
    const mara=screen.getByRole('switch',{name:'Mara Jensen active'});
    expect(mara).toBeDisabled();
    expect(mara).toHaveAccessibleDescription('Reassign 1 customer in Rep assignments first');
    const me=screen.getByRole('switch',{name:'Brandi Gallegos active'});
    expect(me).toBeDisabled();
    expect(me).toHaveAccessibleDescription('You can’t mark yourself inactive');
  });

  it('marks a rep with no customers inactive, and can turn them back on',async()=>{
    const off=TEAM.map(r=>r.id==='eli'?{...r,active:false}:r);
    replies=[{body:{reps:off}}];
    const onChange=renderIt();
    fireEvent.click(screen.getByRole('switch',{name:'Eli Porter active'}));
    await waitFor(()=>expect(onChange).toHaveBeenCalledWith(off));
    expect(sent()).toEqual([{url:'/api/rep/team/reps/eli',body:{active:false}}]);
  });

  it('shows an inactive rep as Inactive with the switch off and enabled',()=>{
    renderIt(vi.fn(),TEAM.map(r=>r.id==='eli'?{...r,active:false}:r));
    const eli=screen.getByRole('switch',{name:'Eli Porter active'});
    expect(eli).not.toBeChecked();
    expect(eli).toBeEnabled();
    expect(eli).toHaveAccessibleDescription('Inactive');
  });

  it("saves a team label (trimmed by the server) and shows the server's reason when a change is refused",async()=>{
    const renamed=TEAM.map(r=>r.id==='eli'?{...r,team:'Field Sales'}:r);
    replies=[{body:{reps:renamed}},{status:409,body:{detail:'Eli Porter still has 1 customer.',code:'has_customers'}}];
    const onChange=renderIt();
    const label=screen.getByRole('textbox',{name:'Team label for Eli Porter'});
    const save=within(row('Eli Porter')).getByRole('button',{name:'Save'});
    expect(save).toBeDisabled();
    fireEvent.change(label,{target:{value:' Field Sales '}});
    fireEvent.click(save);
    await waitFor(()=>expect(onChange).toHaveBeenCalledWith(renamed));
    expect(sent()[0]).toEqual({url:'/api/rep/team/reps/eli',body:{team:' Field Sales '}});
    fireEvent.click(screen.getByRole('switch',{name:'Eli Porter active'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('Eli Porter still has 1 customer.');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('sends an emptied label as a clear (null)',async()=>{
    const cleared=TEAM.map(r=>r.id==='nora'?{...r,team:null}:r);
    replies=[{body:{reps:cleared}}];
    const onChange=renderIt();
    fireEvent.change(screen.getByRole('textbox',{name:'Team label for Nora Chen'}),{target:{value:'  '}});
    fireEvent.click(within(row('Nora Chen')).getByRole('button',{name:'Save'}));
    await waitFor(()=>expect(onChange).toHaveBeenCalledWith(cleared));
    expect(sent()).toEqual([{url:'/api/rep/team/reps/nora',body:{team:null}}]);
  });
});
