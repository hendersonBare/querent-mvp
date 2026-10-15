// `npm run eval:record`: re-records src/eval/judge-recording.json with the live judge (B4's
// src/server/llm judge, the one the quote tool uses). Every evaluation case goes through retrieve
// against data/boxt-catalog.json, and its candidates (as the pipeline gives them) go to the judge.
// Needs ANTHROPIC_API_KEY (live mode); without it, or with QUERENT_SCRIPTED=1, it exits 1 and leaves
// the file alone. If any call fails (judge_error) nothing is written either, so a network problem
// never turns into recorded "none" verdicts. Afterwards run `npm run eval:report` and `npm run test:eval`.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {DEFAULT_LEVEL,matchConfig} from '../src/features/settings/strictness';
import {JUDGE_ERROR,NO_CANDIDATES,getJudge,judgeAll,llmMode,model} from '../src/server/llm';
import type {JudgeVerdict} from '../src/server/llm/types';
import {retrieve} from '../src/server/matching/retrieve';
import {CASES} from '../src/eval/cases';
import {CATALOG,judgeCandidates,type Recording} from '../src/eval/run';

const FILE=resolve(__dirname,'../src/eval/judge-recording.json');

async function main(){
  if(llmMode(process.env)!=='live'){
    console.error('eval:record needs the live judge: set ANTHROPIC_API_KEY (and unset QUERENT_SCRIPTED). src/eval/judge-recording.json was not changed.');
    process.exit(1);
  }
  const lines=CASES.map(c=>({c,candidates:judgeCandidates(retrieve(c.description,CATALOG,matchConfig(DEFAULT_LEVEL)))}));
  const asked=lines.filter(l=>l.candidates.length);
  console.log(`Judging ${asked.length} lines with ${model()} (${lines.length-asked.length} have no candidates)...`);
  const answers=await judgeAll(asked.map(l=>({line:{description:l.c.description,rawText:l.c.original},candidates:l.candidates})),getJudge(),
    {onProgress:(done,total)=>{if(process.stdout.isTTY)process.stdout.write(`\r${done}/${total}${done===total?'\n':''}`);}});
  const failed=asked.filter((_,i)=>answers[i].reason===JUDGE_ERROR).map(l=>l.c.id);
  if(failed.length){
    console.error(`${failed.length} judge calls failed (${failed.slice(0,5).join(', ')}${failed.length>5?', ...':''}); src/eval/judge-recording.json was not changed.`);
    process.exit(1);
  }
  const verdicts:Record<string,JudgeVerdict>={};
  for(const l of lines)verdicts[l.c.id]=l.candidates.length?answers[asked.indexOf(l)]:{sku:null,reason:NO_CANDIDATES};
  const before=(JSON.parse(readFileSync(FILE,'utf8')) as Recording).verdicts;
  const changed=CASES.filter(c=>(before[c.id]?.sku??null)!==verdicts[c.id].sku).map(c=>`${c.id}: ${before[c.id]?.sku??'none'} -> ${verdicts[c.id].sku??'none'}`);
  const recording:Recording={
    _about:'Judge verdicts for src/eval/cases.ts, one per case id (B4\'s JudgeVerdict: the SKU the judge picked from the candidate list, or null). Recorded from the live judge by `npm run eval:record`.',
    recordedBy:'live',model:model(),recordedAt:new Date().toISOString(),verdicts,
  };
  writeFileSync(FILE,`${JSON.stringify(recording,null,2)}\n`);
  console.log(`Wrote src/eval/judge-recording.json. ${changed.length} verdicts changed${changed.length?':':'.'}`);
  for(const line of changed)console.log(`  ${line}`);
}

main().catch(error=>{
  console.error(`eval:record failed: ${error instanceof Error?error.message:String(error)}. src/eval/judge-recording.json was not changed.`);
  process.exit(1);
});
