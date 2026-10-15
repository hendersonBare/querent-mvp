// `npm run eval:report`: the matching evaluation suite (src/eval) at every strictness level, with the
// recorded judge and with a judge that always agrees with the scorer. Prints, per level and judge:
// matched lines, precision on the matched set, false positives, must-match recall and the no-match
// rate, then the lines that decide the calibration. Use it to tune LEVELS in
// src/features/settings/strictness.ts; put the table in src/eval/README.md.
//
// Flags: --markdown prints only the README table; --cases also lists every case's outcome.
import {CASES,type EvalCase} from '../src/eval/cases';
import {HELDOUT_BARE_SIZES} from '../src/eval/heldout';
import {STRICTNESS_LEVELS} from '../src/features/settings/strictness';
import {decide} from '../src/server/matching/decide';
import {report,retrieveAt,runCase,type JudgeKind} from '../src/eval/run';

const pct=(n:number)=>`${(n*100).toFixed(0)}%`;
const rows=report();
const markdown=process.argv.includes('--markdown');
const mustMatch=CASES.filter(c=>c.expect!=='no_match').length;

const table=[
  '| Level | minScore | minLead | Judge | Matched | Precision | False positives | Must-match recall | No-match rate |',
  '|---|---|---|---|---|---|---|---|---|',
  ...rows.map(r=>`| ${r.label} | ${r.rule.minScore} | ${r.rule.minLead} | ${r.judge} | ${r.metrics.matched}/${r.metrics.cases} | ${pct(r.metrics.precision)} | ${r.metrics.falsePositives.length?r.metrics.falsePositives.join(', '):'0'} | ${pct(r.metrics.recall)} (${Math.round(r.metrics.recall*mustMatch)}/${mustMatch}) | ${pct(r.metrics.noMatchRate)} |`),
].join('\n');

if(markdown){
  console.log(table);
}else{
  console.log(`Matching evaluation: ${CASES.length} lines (${mustMatch} must match, ${CASES.length-mustMatch} must not match) against data/boxt-catalog.json\n`);
  console.log(table);
  const strict=rows.find(r=>r.level==='strict'&&r.judge==='recorded')!;
  const missed=strict.results.filter(r=>CASES.find(c=>c.id===r.id)!.expect!=='no_match'&&r.outcome!=='matched');
  console.log(`\nMust-match lines Strict leaves for the rep (recorded judge): ${missed.length}`);
  for(const r of missed)console.log(`  ${r.id}: ${r.reason} (top ${r.topSku} ${r.topScore}, lead ${r.lead})`);
  // Strict's margin: how far the must-not-match lines are from clearing it on each axis.
  const allFalses=CASES.filter(c=>c.expect==='no_match').map(c=>strict.results.find(r=>r.id===c.id)!);
  // A line that names no product type never clears, whatever its score (rule in retrieve()); at Strict
  // neither does a line that is not Strict-eligible (total accounting). The margins are measured on the rest.
  const falses=allFalses.filter(r=>r.namesProduct&&retrieveAt(CASES.find(c=>c.id===r.id)!.description,'strict').eligibility.strictEligible);
  console.log(`\n${allFalses.length-falses.length} of ${allFalses.length} must-not-match lines name no product the top item confirms or are not Strict-eligible (total accounting): they cannot clear Strict.`);
  const {minScore,minLead}=strict.rule;
  const scoreSide=falses.filter(r=>r.lead>=minLead).sort((a,b)=>b.topScore-a.topScore)[0];
  const leadSide=falses.filter(r=>r.topScore>=minScore).sort((a,b)=>b.lead-a.lead)[0];
  console.log(`\nStrict margin (minScore ${minScore}, minLead ${minLead}) on the ${falses.length} Strict-eligible must-not-match lines, on the scorer alone:`);
  console.log(scoreSide?`  best top score with a passing lead: ${scoreSide.topScore} (${scoreSide.id}), ${(minScore-scoreSide.topScore).toFixed(2)} below minScore`:'  none has a passing lead');
  console.log(leadSide?`  best lead with a passing score: ${leadSide.lead} (${leadSide.id}), ${(minLead-leadSide.lead).toFixed(2)} below minLead`:'  none has a passing score');
  const closest=CASES.filter(c=>c.expect==='no_match').map(c=>strict.results.find(r=>r.id===c.id)!).sort((a,b)=>b.topScore-a.topScore).slice(0,8);
  console.log('\nMust-not-match lines closest to matching (top score, lead):');
  for(const r of closest)console.log(`  ${r.id}: ${r.topSku??'-'} ${r.topScore}, lead ${r.lead}`);
  // Total accounting: the must-not-match lines that are Strict-eligible against their top item, where
  // Strict rests on the score and lead alone.
  const eligible=CASES.filter(c=>c.expect==='no_match').filter(c=>retrieveAt(c.description,'strict').eligibility.strictEligible);
  console.log(`\nMust-not-match lines Strict-eligible against their top item (Strict then rests on the lead): ${eligible.length}`);
  for(const c of eligible){const r=retrieveAt(c.description,'strict');console.log(`  ${c.id}: ${r.top?.item.sku} ${r.top?.score}, lead ${r.lead}`);}

  // By source: the hand-written cases, the verifiers' held-out probes, and the B3b attack lines.
  const groups:[string,(c:EvalCase)=>boolean][]=[
    ['hand-written',c=>!c.tags?.length],
    ['held-out (verifier probes)',c=>!!c.tags?.includes('heldout')],
    ['B3b (attack + realistic)',c=>!!c.tags?.includes('b3b')],
    ['round 2 realistic must-match (b3v-must.txt)',c=>c.id.startsWith('h2m')],
    ['round 3 realistic must-match (mm.json)',c=>/^h3-R\d/.test(c.id)],
  ];
  console.log('\n| Source | Level | Judge | Must-not lines matched | Must-match recall |\n|---|---|---|---|---|');
  for(const [name,keep] of groups){
    const cases=CASES.filter(keep);
    const not=cases.filter(c=>c.expect==='no_match'),must=cases.filter(c=>c.expect!=='no_match');
    for(const level of STRICTNESS_LEVELS)for(const judge of ['always-agree','recorded'] as JudgeKind[]){
      const fp=cases.map(c=>runCase(c,level,judge)).filter(r=>r.falsePositive);
      const hit=must.map(c=>runCase(c,level,judge)).filter(r=>r.outcome==='matched'&&r.correct).length;
      console.log(`| ${name} | ${level} | ${judge} | ${fp.length}/${not.length}${fp.length?` (${fp.map(r=>r.id).join(', ')})`:''} | ${must.length?`${hit}/${must.length} (${pct(hit/must.length)})`:'-'} |`);
    }
  }
  const bare=STRICTNESS_LEVELS.map(level=>HELDOUT_BARE_SIZES.filter(line=>{const r=retrieveAt(line,level);return decide(r,{sku:r.top?.item.sku??null}).outcome==='matched';}).length);
  console.log(`\nHeld-out bare sizes (b3v-sizes.txt, ${HELDOUT_BARE_SIZES.length}), matched with the always-agree judge: ${STRICTNESS_LEVELS.map((l,i)=>`${l} ${bare[i]}`).join(', ')}`);
  if(process.argv.includes('--cases')){
    for(const r of rows){
      console.log(`\n${r.label} / ${r.judge}`);
      for(const x of r.results)console.log(`  ${x.correct?' ':'!'} ${x.id.padEnd(28)} ${x.outcome==='matched'?`matched ${x.sku}`:`no match (${x.reason})`}`);
    }
  }
}
