import {readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {describe,expect,it} from 'vitest';

// The Lane U frame ledger guard (plan U11): every board in docs/design/canvas-frames/canvas.json
// appears exactly once in the "Lane U frame ledger" table of docs/plans/status.md, and each row's
// state is PASS, deferred with a reason, or no-frame. The checker also runs against a deliberately
// broken copy (test/fixtures/frames-ledger/status-broken.md), so it is known to catch each problem.

const ROOT=resolve(__dirname,'..');
const STATUS=process.env.QUERENT_LEDGER_STATUS??join(ROOT,'docs/plans/status.md');
const BROKEN=join(ROOT,'test/fixtures/frames-ledger/status-broken.md');
const HEADING='### Lane U frame ledger';

/** The frame ids canvas.json indexes (C_QOBoard.dc.html is C_QOBoard). */
export function canvasBoards(canvas:{boards:Record<string,unknown>}):string[]{
  return Object.keys(canvas.boards).map(name=>name.replace(/\.dc\.html$/,''));
}

/** The ledger's rows, | Frame | Task | State |, from the ledger heading to the next heading of any level. */
export function ledgerRows(status:string):{frame:string;task:string;state:string}[]|null{
  const start=status.indexOf(`${HEADING}\n`);
  if(start<0)return null;
  const body=status.slice(start+HEADING.length);
  const end=body.search(/^#{1,6} /m);
  return [...(end<0?body:body.slice(0,end)).matchAll(/^\|\s*(C_\w+)\s*\|([^|\n]*)\|(.*)\|\s*$/gm)]
    .map(m=>({frame:m[1],task:m[2].trim(),state:m[3].trim()}));
}

/** A state the ledger allows: PASS (with or without a note), deferred with a reason, or no-frame. */
export function validState(state:string){
  if(/^PASS\b/.test(state)||/^no-frame\b/.test(state))return true;
  const deferred=/^deferred\b\s*[(:,-]?\s*(.*)$/.exec(state);
  return !!deferred&&/\w{3,}/.test(deferred[1].replace(/\)$/,''));
}

/** Every problem with the ledger, in plain words; none when it is complete. */
export function ledgerProblems(boards:readonly string[],status:string):string[]{
  const rows=ledgerRows(status);
  if(!rows)return [`No "${HEADING}" section`];
  const problems:string[]=[];
  const seen=new Map<string,number>();
  for(const r of rows)seen.set(r.frame,(seen.get(r.frame)??0)+1);
  for(const b of boards)if(!seen.has(b))problems.push(`${b}: missing from the ledger`);
  for(const [frame,n] of seen){
    if(!boards.includes(frame))problems.push(`${frame}: not a canvas.json board`);
    if(n>1)problems.push(`${frame}: listed ${n} times`);
  }
  for(const r of rows){
    if(!r.task)problems.push(`${r.frame}: no task`);
    if(!validState(r.state))problems.push(`${r.frame}: state "${r.state}" is not PASS, deferred (with a reason) or no-frame`);
  }
  return problems;
}

const canvas=JSON.parse(readFileSync(join(ROOT,'docs/design/canvas-frames/canvas.json'),'utf8'));
const boards=canvasBoards(canvas);

describe('the Lane U frame ledger',()=>{
  it('canvas.json indexes 89 frames',()=>{
    expect(boards).toHaveLength(89);
    expect(new Set(boards).size).toBe(89);
  });

  it('lists every canvas.json board exactly once, each PASS, deferred with a reason, or no-frame',()=>{
    expect(ledgerProblems(boards,readFileSync(STATUS,'utf8'))).toEqual([]);
  });

  it('has as many rows as canvas.json has boards',()=>{
    expect(ledgerRows(readFileSync(STATUS,'utf8'))).toHaveLength(boards.length);
  });
});

describe('the ledger checker',()=>{
  it('reports each problem in a deliberately broken ledger',()=>{
    expect(ledgerProblems(boards,readFileSync(BROKEN,'utf8'))).toEqual([
      'C_QOB4: missing from the ledger',
      'C_QOB9: missing from the ledger',
      'C_ZZ1: not a canvas.json board',
      'C_QOB1: listed 2 times',
      'C_QOB2: state "deferred" is not PASS, deferred (with a reason) or no-frame',
      'C_QOB5: state "FAIL (two differences)" is not PASS, deferred (with a reason) or no-frame',
      'C_QOB6: no task',
      'C_QOB7: state "" is not PASS, deferred (with a reason) or no-frame',
    ]);
  });

  it('stops at the next heading, so rows under another section do not count',()=>{
    const ledger=`${HEADING}\n| Frame | Task | State |\n|---|---|---|\n| C_QOB1 | U3 | PASS |\n\n## Next\n| C_QOB3 | U2 | PASS |\n`;
    expect(ledgerRows(ledger)?.map(r=>r.frame)).toEqual(['C_QOB1']);
  });

  it('needs the ledger heading',()=>{
    expect(ledgerProblems(boards,'# Status\n')).toEqual([`No "${HEADING}" section`]);
  });

  it('takes PASS with a note, deferred with a reason and no-frame',()=>{
    for(const s of ['PASS','PASS (`e2e/frames-shell.spec.ts`)','deferred (waits for the Supabase work)','deferred: no data yet','no-frame'])expect(validState(s),s).toBe(true);
    for(const s of ['','deferred','deferred ()','pass','FAIL','TODO'])expect(validState(s),s).toBe(false);
  });
});
