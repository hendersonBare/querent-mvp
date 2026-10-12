import {fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {ReassignDialog} from './ReassignDialog';

// The Reassign dialog (v3 spec §5, §6, §8; decisions 21, 22, 45; task D2) for several quotes at once.
// The Quotes list's bulk action that opened it is gone (decision 45: bulk reassign moves to Teams and
// Reps, plan U7); these checks moved here from the old list tests, since the dialog and
// POST /api/rep/quotes/reassign stay (the quote page uses it for one quote, U7 for several).

const fetchMock=vi.fn(async(_input:RequestInfo|URL,init?:RequestInit)=>{
  const body=JSON.parse(String(init!.body));
  return Response.json({replayed:false,to:{id:body.toRepId,name:'Eli Porter'},skipped:[],
    moved:body.quoteIds.map((id:string)=>({id,quote_number:id.toUpperCase(),from:{id:'mara',name:'Mara Jensen'}}))});
});
const posts=()=>fetchMock.mock.calls.map(([url,init])=>({url:String(url),body:JSON.parse(String(init!.body)),key:new Headers(init!.headers).get('idempotency-key')}));

beforeEach(()=>{fetchMock.mockClear();vi.stubGlobal('fetch',fetchMock);});
afterEach(()=>vi.unstubAllGlobals());

const QUOTES=[{id:'q-30001',quote_number:'Q-30001'},{id:'q-30002',quote_number:'Q-30002'}];
const TARGETS=[{id:'eli',name:'Eli Porter'},{id:'brandi',name:'Brandi Gallegos'},{id:'mara',name:'Mara Jensen'}];

describe('ReassignDialog, several quotes',()=>{
  it('offers the active reps, the manager first, and moves the quotes to the one picked',async()=>{
    const onDone=vi.fn();
    render(<ReassignDialog quotes={QUOTES} targets={TARGETS} me="brandi" onClose={vi.fn()} onDone={onDone}/>);
    const dialog=screen.getByRole('dialog',{name:'Reassign 2 quotes'});
    const target=within(dialog).getByRole('combobox',{name:'New rep'});
    expect(within(target).getAllByRole('option').map(o=>o.textContent)).toEqual(['Choose a rep','Brandi Gallegos (you)','Eli Porter','Mara Jensen']);
    expect(within(dialog).getByRole('button',{name:'Reassign'})).toBeDisabled();
    fireEvent.change(target,{target:{value:'eli'}});
    fireEvent.click(within(dialog).getByRole('button',{name:'Reassign'}));
    await waitFor(()=>expect(onDone).toHaveBeenCalled());
    expect(posts()).toEqual([{url:'/api/rep/quotes/reassign',body:{quoteIds:['q-30001','q-30002'],toRepId:'eli'},key:expect.stringMatching(/.+/)}]);
    expect(onDone.mock.calls[0][0]).toMatchObject({to:{id:'eli',name:'Eli Porter'}});
  });

  it('Cancel closes it with nothing sent',()=>{
    const onClose=vi.fn();
    render(<ReassignDialog quotes={QUOTES} targets={TARGETS} me="brandi" onClose={onClose} onDone={vi.fn()}/>);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Cancel'}));
    expect(onClose).toHaveBeenCalled();
    expect(posts()).toEqual([]);
  });
});
