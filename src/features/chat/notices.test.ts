import {describe,expect,it} from 'vitest';
import type {QuoteNotice} from '@/domain';
import type {ChatTurn} from '@/lib/contracts';
import {addArrived,placeWithHistory,timeline} from './notices';

// Where the "quote is ready" messages go among the chat's turns (task 5.1).

const turn=(id:string,timestamp?:string):ChatTurn=>({id,question:id,answer:`${id}.`,categories:[],outcome:'answered',row_count:0,...(timestamp?{timestamp}:{})});
const notice=(id:string,created_at:string):QuoteNotice=>({id,conversation_id:'c',created_at,text:'',quote_id:'q-1',quote_number:'Q-1',revision:1,total:10,valid_until:'2026-10-07',
  headline:'Quote Q-1 is ready: $10.00, valid until Oct 7',attach_pdf:true,pdf_url:'/api/quotes/q-1/pdf?variant=customer&rev=1'});
const order=(entries:ReturnType<typeof timeline>)=>entries.map(e=>e.kind==='turn'?e.turn.id:e.notice.id);

const HISTORY=[turn('t1','2026-09-23T10:00:00.000Z'),turn('t2','2026-09-23T11:00:00.000Z'),turn('t3','2026-09-23T12:00:00.000Z')];

describe('placeWithHistory',()=>{
  it('puts each notice after the turns logged at or before it, in time order',()=>{
    const placed=placeWithHistory(HISTORY,[notice('n0','2026-09-23T09:00:00.000Z'),notice('n1','2026-09-23T11:00:00.000Z'),notice('n2','2026-09-23T11:30:00.000Z'),notice('n3','2026-09-24T09:00:00.000Z')]);
    expect(placed.map(p=>[p.notice.id,p.after])).toEqual([['n0',0],['n1',2],['n2',2],['n3',3]]);
    expect(order(timeline(HISTORY,placed))).toEqual(['n0','t1','t2','n1','n2','t3','n3']);
  });

  it('with no history, every notice comes first',()=>{
    expect(placeWithHistory([],[notice('n1','2026-09-23T11:00:00.000Z')])).toEqual([{notice:notice('n1','2026-09-23T11:00:00.000Z'),after:0}]);
  });
});

describe('addArrived',()=>{
  it('adds only new notices, after the turns on screen when they arrived, and keeps the rest where they were',()=>{
    const placed=placeWithHistory(HISTORY,[notice('n1','2026-09-23T11:30:00.000Z')]);
    const next=addArrived(placed,[notice('n1','2026-09-23T11:30:00.000Z'),notice('n2','2026-09-23T13:00:00.000Z')],4);
    expect(next.map(p=>[p.notice.id,p.after])).toEqual([['n1',2],['n2',4]]);
    // Asked in this session: a fourth turn, still waiting for its answer.
    const turns=[...HISTORY,turn('t4')];
    expect(order(timeline(turns,next))).toEqual(['t1','t2','n1','t3','t4','n2']);
    // Later turns go after it.
    expect(order(timeline([...turns,turn('t5')],next))).toEqual(['t1','t2','n1','t3','t4','n2','t5']);
  });

  it('returns the same array when nothing is new, so a poll doesn’t re-render',()=>{
    const placed=placeWithHistory(HISTORY,[notice('n1','2026-09-23T11:30:00.000Z')]);
    expect(addArrived(placed,[notice('n1','2026-09-23T11:30:00.000Z')],3)).toBe(placed);
    expect(addArrived(placed,[],3)).toBe(placed);
  });
});

describe('timeline',()=>{
  it('shows a notice placed past the last turn at the end (a failed question was taken back)',()=>{
    expect(order(timeline(HISTORY.slice(0,1),[{notice:notice('n1','2026-09-23T13:00:00.000Z'),after:3}]))).toEqual(['t1','n1']);
  });

  it('keeps each turn’s index for the controls that depend on it',()=>{
    const entries=timeline(HISTORY,[{notice:notice('n1','x'),after:1}]);
    expect(entries.flatMap(e=>e.kind==='turn'?[[e.turn.id,e.index]]:[])).toEqual([['t1',0],['t2',1],['t3',2]]);
  });
});
