import {act,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {BOARD,NESTED} from './test-fixtures';

// Teams and Reps (plan U7; C_TRBase to C_TR7; decisions 21, 45, 47): the manager's Reps card (customers
// under each rep, disconnect with a new rep in the same step, connect with a move confirm, active flags
// saved with Save, rows selected for a bulk reassign of their open quotes) and the Teams card (create,
// select, add, remove, move inside another team). Writes go through the backing routes; the board comes back.

const router=vi.hoisted(()=>({push:vi.fn(),replace:vi.fn(),refresh:vi.fn()}));
vi.mock('next/navigation',()=>({useRouter:()=>router}));
const {TeamsAndReps}=await import('./TeamsAndReps');

const fetchMock=vi.fn();
type Sent={url:string;method:string;body:unknown};
const sent=():Sent[]=>fetchMock.mock.calls.map(([url,init])=>({url:String(url),method:init?.method??'GET',body:init?.body?JSON.parse(String(init.body)):undefined}));
const json=(body:unknown,status=200)=>Promise.resolve(new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}}));
beforeEach(()=>{fetchMock.mockReset();fetchMock.mockImplementation(()=>json(BOARD));vi.stubGlobal('fetch',fetchMock);});
afterEach(()=>vi.unstubAllGlobals());

const reps=()=>screen.getByRole('region',{name:'Reps'});
const teams=()=>screen.getByRole('region',{name:'Teams'});
const repRow=(name:string)=>within(reps()).getAllByRole('row').find(r=>within(r).queryByText(name,{exact:true}))!;
const dialog=(name:string|RegExp)=>screen.getByRole('dialog',{name});

describe('the page (C_TRBase)',()=>{
  it('has the title and line, the Reps card without managers and the Teams card with rep counts',()=>{
    render(<TeamsAndReps initial={BOARD}/>);
    expect(screen.getByRole('heading',{level:1})).toHaveTextContent('Teams and Reps');
    expect(screen.getByText('Who is on your team and which customers they own')).toBeInTheDocument();
    expect(within(reps()).getByText('3 reps. Managers are not listed.')).toBeInTheDocument();
    expect(within(reps()).getAllByRole('columnheader').map(h=>h.textContent)).toEqual([':: Rep name',':: Customers',':: Role',':: Team',':: Active']);
    const rows=within(reps()).getAllByRole('row').slice(1).map(r=>within(r).getAllByRole('cell').map(c=>c.textContent));
    expect(rows).toEqual([
      ['Eli Porter','2 customers','Outside Sales','Outside Sales',''],
      ['Mara Jensen','1 customer','Inside Sales','Inside Sales',''],
      ['Nora Chen','1 customer','Account Manager','Outside Sales',''],
    ]);
    expect(screen.queryByText('Brandi Gallegos')).toBeNull();
    expect(within(reps()).getAllByRole('switch').map(s=>s.getAttribute('aria-checked'))).toEqual(['true','true','true']);
    expect(within(reps()).getByRole('button',{name:'Save'})).toBeInTheDocument();
    expect(within(teams()).getAllByRole('checkbox').map(c=>c.closest('label')!.textContent)).toEqual(['Inside Sales2 reps','Outside Sales2 reps']);
    expect(within(teams()).getByRole('button',{name:'Create team'})).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\u2014/);
  });

  it('nests a team inside its parent, whose count takes in the reps of the teams inside it',()=>{
    render(<TeamsAndReps initial={NESTED}/>);
    expect(within(teams()).getAllByRole('checkbox').map(c=>c.closest('label')!.textContent)).toEqual(['Inside Sales4 reps','Outside Sales2 reps']);
  });
});

describe('customers under a rep (C_TR1, C_TR2)',()=>{
  it('opens with the count button: each customer with an x, and Connect a customer',()=>{
    render(<TeamsAndReps initial={BOARD}/>);
    fireEvent.click(within(repRow('Eli Porter')).getByRole('button',{name:'2 customers'}));
    const list=within(reps()).getByRole('group',{name:'Customers for Eli Porter'});
    expect(within(repRow('Eli Porter')).getByRole('button',{name:'Hide customers'})).toHaveAttribute('aria-expanded','true');
    expect(within(list).getAllByRole('listitem').map(i=>i.textContent)).toEqual(['Utah Valley Electric UVE-5126x','Weber Basin Fabricators WBF-6074x']);
    expect(within(list).getByRole('button',{name:'Disconnect Utah Valley Electric'})).toBeInTheDocument();
    expect(within(list).getByRole('button',{name:/Connect a customer$/})).toBeInTheDocument();
    fireEvent.click(within(repRow('Eli Porter')).getByRole('button',{name:'Hide customers'}));
    expect(within(reps()).queryByRole('group',{name:'Customers for Eli Porter'})).toBeNull();
  });

  it('disconnecting asks for the new rep in the same step, and can move the open quotes',async()=>{
    render(<TeamsAndReps initial={BOARD}/>);
    fireEvent.click(within(repRow('Eli Porter')).getByRole('button',{name:'2 customers'}));
    fireEvent.click(screen.getByRole('button',{name:'Disconnect Utah Valley Electric'}));
    const d=within(dialog('Disconnect Utah Valley Electric?'));
    expect(d.getByText('Every customer needs a rep. Pick who takes Utah Valley Electric from Eli Porter.')).toBeInTheDocument();
    expect(d.getAllByRole('radio').map(r=>r.textContent)).toEqual(['Brandi Gallegos2 customers','Mara Jensen1 customer','Nora Chen1 customer']);
    const go=d.getByRole('button',{name:'Disconnect and reassign'});
    expect(go).toBeDisabled();
    fireEvent.click(d.getByRole('radio',{name:/^Nora Chen/}));
    expect(d.getByRole('radio',{name:/^Nora Chen/})).toHaveAttribute('aria-checked','true');
    const move=d.getByRole('checkbox',{name:/Also move this customer's open quotes/});
    expect(move).not.toBeChecked();
    expect(d.getByText("Drafts, change requests and sent quotes that haven't expired go to the new rep, each with an Activity entry.")).toBeInTheDocument();
    fireEvent.click(move);
    expect(go).toBeEnabled();
    await act(async()=>{fireEvent.click(go);});
    await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
    expect(sent()).toEqual([
      {url:'/api/rep/settings/assignments',method:'PUT',body:{customer_id:'utah-valley-electric',rep_id:'nora',moveOpenQuotes:true}},
      {url:'/api/rep/teams',method:'GET',body:undefined},
    ]);
  });

  it('a rep with no customers yet reads "No customers yet" in the dialog; Cancel sends nothing',()=>{
    const board={...BOARD,owners:BOARD.owners.map(o=>o.id==='nora'?{...o,customer_count:0}:o)};
    render(<TeamsAndReps initial={board}/>);
    fireEvent.click(within(repRow('Eli Porter')).getByRole('button',{name:'2 customers'}));
    fireEvent.click(screen.getByRole('button',{name:'Disconnect Weber Basin Fabricators'}));
    expect(within(dialog('Disconnect Weber Basin Fabricators?')).getByRole('radio',{name:/^Nora Chen/})).toHaveTextContent('Nora ChenNo customers yet');
    fireEvent.click(screen.getByRole('button',{name:'Cancel'}));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('connect a customer (C_TR3, C_TR4)',()=>{
  it('searches the other customers, each with its rep, then asks to confirm a move with the open quotes that would move',async()=>{
    render(<TeamsAndReps initial={BOARD}/>);
    fireEvent.click(within(repRow('Eli Porter')).getByRole('button',{name:'2 customers'}));
    fireEvent.click(screen.getByRole('button',{name:/Connect a customer$/}));
    const pick=within(screen.getByRole('listbox',{name:'Connect a customer to Eli Porter'}));
    expect(pick.getAllByRole('option').map(o=>o.textContent)).toEqual([
      'Canyon Ridge Builders CRB-3318With Mara Jensen','Great Basin Fabrication GBF-2207With Brandi Gallegos',
      'Uinta Facility Services UFS-4051With Nora Chen','Wasatch Mechanical Contractors WAS-1142With Brandi Gallegos',
    ]);
    expect(screen.getByText('Customers that already have a rep ask you to confirm the move.')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox',{name:'Search customers'}),{target:{value:'canyon'}});
    expect(pick.getAllByRole('option').map(o=>o.textContent)).toEqual(['Canyon Ridge Builders CRB-3318With Mara Jensen']);
    fireEvent.click(pick.getByRole('option',{name:/Canyon Ridge Builders/}));
    const d=within(dialog('Canyon Ridge Builders is with Mara Jensen'));
    expect(d.getByText('Connecting it to Eli Porter takes it off Mara Jensen. Mara will keep 0 customers.')).toBeInTheDocument();
    // Two of its three open quotes are Mara's; the one Eli already has stays put.
    fireEvent.click(d.getByRole('checkbox',{name:"Also move this customer's open quotes (2 quotes)"}));
    await act(async()=>{fireEvent.click(d.getByRole('button',{name:'Move to Eli Porter'}));});
    await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
    expect(sent()[0]).toEqual({url:'/api/rep/settings/assignments',method:'PUT',body:{customer_id:'canyon-ridge',rep_id:'eli',moveOpenQuotes:true}});
  });

  it('shows the server’s refusal in the dialog and keeps it open',async()=>{
    fetchMock.mockImplementation(()=>json({detail:'Eli Porter is inactive. Choose an active rep.'},400));
    render(<TeamsAndReps initial={BOARD}/>);
    fireEvent.click(within(repRow('Eli Porter')).getByRole('button',{name:'2 customers'}));
    fireEvent.click(screen.getByRole('button',{name:/Connect a customer$/}));
    fireEvent.click(screen.getByRole('option',{name:/Uinta Facility Services/}));
    await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Move to Eli Porter'}));});
    expect(await screen.findByRole('alert')).toHaveTextContent('Eli Porter is inactive. Choose an active rep.');
    expect(dialog('Uinta Facility Services is with Nora Chen')).toBeInTheDocument();
  });
});

describe('active flags and Save',()=>{
  it('keeps toggles until Save, then saves each change; a refusal (customers still assigned) shows in the card',async()=>{
    fetchMock.mockImplementation((url:string)=>String(url).includes('/team/reps/')
      ?json({detail:'Mara Jensen still has 1 customer. Reassign it before marking Mara Jensen inactive.',code:'has_customers'},409)
      :json(BOARD));
    render(<TeamsAndReps initial={BOARD}/>);
    const mara=within(repRow('Mara Jensen')).getByRole('switch',{name:'Mara Jensen active'});
    fireEvent.click(mara);
    expect(mara).toHaveAttribute('aria-checked','false');
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async()=>{fireEvent.click(within(reps()).getByRole('button',{name:'Save'}));});
    expect(sent()[0]).toEqual({url:'/api/rep/team/reps/mara',method:'PUT',body:{active:false}});
    expect(await within(reps()).findByRole('alert')).toHaveTextContent('Mara Jensen still has 1 customer. Reassign it before marking Mara Jensen inactive.');
  });
});

describe('bulk reassign (decision 45): rows selected on the Reps table',()=>{
  it('selecting reps offers their open quotes to the reassign dialog',async()=>{
    render(<TeamsAndReps initial={BOARD}/>);
    fireEvent.click(within(repRow('Mara Jensen')).getByText('Mara Jensen'));
    expect(repRow('Mara Jensen')).toHaveAttribute('aria-selected','true');
    const bar=within(screen.getByRole('region',{name:'Selected reps'}));
    expect(bar.getByText('Mara Jensen')).toBeInTheDocument();
    fireEvent.click(within(repRow('Eli Porter')).getByText('Eli Porter'));
    expect(bar.getByText('2 reps')).toBeInTheDocument();
    fireEvent.click(bar.getByRole('button',{name:'Reassign open quotes'}));
    const d=within(dialog('Reassign 5 quotes'));
    fireEvent.change(d.getByRole('combobox',{name:'New rep'}),{target:{value:'nora'}});
    fetchMock.mockImplementation((url:string)=>String(url).includes('reassign')?json({to:{id:'nora',name:'Nora Chen'},moved:[],skipped:[]}):json(BOARD));
    await act(async()=>{fireEvent.click(d.getByRole('button',{name:'Reassign'}));});
    await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
    expect(sent()[0]).toMatchObject({url:'/api/rep/quotes/reassign',method:'POST',body:{quoteIds:['q1','q2','q3','q4','q5'],toRepId:'nora'}});
  });

  it('a rep with no open quotes has nothing to reassign',()=>{
    render(<TeamsAndReps initial={BOARD}/>);
    fireEvent.click(within(repRow('Nora Chen')).getByText('Nora Chen'));
    expect(within(screen.getByRole('region',{name:'Selected reps'})).getByRole('button',{name:'Reassign open quotes'})).toBeDisabled();
  });
});

describe('teams (C_TR5, C_TR6, C_TR7)',()=>{
  it('a selected team shows its reps and Add to team, Remove from team, Move into other team',()=>{
    render(<TeamsAndReps initial={BOARD}/>);
    fireEvent.click(within(teams()).getByRole('checkbox',{name:/^Outside Sales/}));
    const bar=within(screen.getByRole('region',{name:'Outside Sales'}));
    expect(bar.getAllByRole('button').map(b=>b.textContent)).toEqual(['Add to team','Remove from team','Move into other team']);
    expect(within(teams()).getByRole('list',{name:'Reps in Outside Sales'})).toHaveTextContent('Eli PorterNora Chen');
  });

  it('creates a team with a name, reps and the team it sits inside',async()=>{
    render(<TeamsAndReps initial={BOARD}/>);
    fireEvent.click(within(teams()).getByRole('button',{name:'Create team'}));
    const d=within(dialog('Create team'));
    expect(d.getAllByRole('checkbox').map(c=>c.closest('label')!.textContent)).toEqual(['Brandi Gallegos','Eli Porter','Mara Jensen','Nora Chen']);
    const create=d.getByRole('button',{name:'Create team'});
    expect(create).toBeDisabled();
    fireEvent.change(d.getByRole('textbox',{name:'Team name'}),{target:{value:'Counter and Yard'}});
    fireEvent.click(d.getByRole('checkbox',{name:'Nora Chen'}));
    expect(d.getByRole('button',{name:'Inside another team: None'})).toBeInTheDocument();
    fireEvent.click(d.getByRole('button',{name:'Inside another team: None'}));
    fireEvent.mouseDown(d.getByRole('option',{name:'Inside Sales'}));
    await act(async()=>{fireEvent.click(create);});
    await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
    expect(sent()).toEqual([{url:'/api/rep/teams',method:'POST',body:{name:'Counter and Yard',rep_ids:['nora'],parent_team_id:1}}]);
  });

  it('moves a team inside another one or on its own, never inside a team inside it',async()=>{
    render(<TeamsAndReps initial={NESTED}/>);
    fireEvent.click(within(teams()).getByRole('checkbox',{name:/^Inside Sales/}));
    fireEvent.click(screen.getByRole('button',{name:'Move into other team'}));
    // Outside Sales sits inside Inside Sales, so only "No parent team" is left.
    expect(within(dialog('Move Inside Sales into another team')).getAllByRole('radio').map(r=>r.textContent)).toEqual(['No parent teamInside Sales stands on its own']);
    fireEvent.click(screen.getByRole('button',{name:'Cancel'}));
    fireEvent.click(within(teams()).getByRole('checkbox',{name:/^Inside Sales/}));
    fireEvent.click(within(teams()).getByRole('checkbox',{name:/^Outside Sales/}));
    fireEvent.click(screen.getByRole('button',{name:'Move into other team'}));
    const d=within(dialog('Move Outside Sales into another team'));
    expect(d.getByText('Reps in Outside Sales stay in it, and also count in the team you pick.')).toBeInTheDocument();
    expect(d.getAllByRole('radio').map(r=>[r.textContent,r.getAttribute('aria-checked')])).toEqual([['Inside Sales4 reps','true'],['No parent teamOutside Sales stands on its own','false']]);
    fireEvent.click(d.getByRole('radio',{name:/^No parent team/}));
    await act(async()=>{fireEvent.click(d.getByRole('button',{name:'Move team'}));});
    expect(sent()[0]).toEqual({url:'/api/rep/teams/2',method:'PATCH',body:{parent_team_id:null}});
  });

  it('adds reps to the selected team and removes its own members',async()=>{
    render(<TeamsAndReps initial={BOARD}/>);
    fireEvent.click(within(teams()).getByRole('checkbox',{name:/^Outside Sales/}));
    fireEvent.click(screen.getByRole('button',{name:'Add to team'}));
    let d=within(dialog('Add reps to Outside Sales'));
    expect(d.getAllByRole('checkbox').map(c=>c.closest('label')!.textContent)).toEqual(['Brandi Gallegos','Mara Jensen']);
    fireEvent.click(d.getByRole('checkbox',{name:'Mara Jensen'}));
    await act(async()=>{fireEvent.click(d.getByRole('button',{name:'Add to team'}));});
    expect(sent()[0]).toEqual({url:'/api/rep/teams/2/members',method:'PUT',body:{add:['mara']}});
    await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.click(screen.getByRole('button',{name:'Remove from team'}));
    d=within(dialog('Remove reps from Outside Sales'));
    expect(d.getAllByRole('checkbox').map(c=>c.closest('label')!.textContent)).toEqual(['Eli Porter','Nora Chen']);
    fireEvent.click(d.getByRole('checkbox',{name:'Eli Porter'}));
    await act(async()=>{fireEvent.click(d.getByRole('button',{name:'Remove from team'}));});
    expect(sent()[1]).toEqual({url:'/api/rep/teams/2/members',method:'PUT',body:{remove:['eli']}});
  });
});

describe('filters (no frame: the minimum to work)',()=>{
  it('the Reps filter narrows by team; a parent team takes in the reps of the teams inside it',()=>{
    render(<TeamsAndReps initial={NESTED}/>);
    fireEvent.click(within(reps()).getByRole('button',{name:/^Filter/}));
    const panel=within(screen.getByRole('dialog',{name:'Filter reps'}));
    fireEvent.click(panel.getByRole('checkbox',{name:'Outside Sales'}));
    fireEvent.click(panel.getByRole('button',{name:'Apply filters'}));
    expect(within(reps()).getByText('2 reps. Managers are not listed.')).toBeInTheDocument();
    fireEvent.click(within(reps()).getByRole('button',{name:/^Filter/}));
    const again=within(screen.getByRole('dialog',{name:'Filter reps'}));
    fireEvent.click(again.getByRole('checkbox',{name:'Outside Sales'}));
    fireEvent.click(again.getByRole('checkbox',{name:'Inside Sales'}));
    fireEvent.click(again.getByRole('button',{name:'Apply filters'}));
    expect(within(reps()).getByText('3 reps. Managers are not listed.')).toBeInTheDocument();
  });

  it('the Teams filter narrows to the teams a picked rep counts in',()=>{
    render(<TeamsAndReps initial={BOARD}/>);
    fireEvent.click(within(teams()).getByRole('button',{name:/^Filter/}));
    const panel=within(screen.getByRole('dialog',{name:'Filter teams'}));
    fireEvent.click(panel.getByRole('checkbox',{name:'Mara Jensen'}));
    fireEvent.click(panel.getByRole('button',{name:'Apply filters'}));
    expect(within(teams()).getAllByRole('checkbox').map(c=>c.closest('label')!.textContent)).toEqual(['Inside Sales2 reps']);
  });
});
