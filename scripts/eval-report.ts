// `npm run eval:report`: the matching evaluation suite (src/eval) at every strictness level, with the
// recorded judge and with a judge that always agrees with the scorer. Prints, per level and judge:
// matched lines, precision on the matched set, false positives, must-match recall and the no-match
// rate, then the lines that decide the calibration. Use it to tune LEVELS in
// src/features/settings/strictness.ts; put the table in src/eval/README.md.
//
// Flags: --markdown prints only the README table; --cases also lists every case's outcome.
import {CASES} from '../src/eval/cases';
import {report} from '../src/eval/run';

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
  const falses=CASES.filter(c=>c.expect==='no_match').map(c=>strict.results.find(r=>r.id===c.id)!);
  const {minScore,minLead}=strict.rule;
  const scoreSide=falses.filter(r=>r.lead>=minLead).sort((a,b)=>b.topScore-a.topScore)[0];
  const leadSide=falses.filter(r=>r.topScore>=minScore).sort((a,b)=>b.lead-a.lead)[0];
  console.log(`\nStrict margin (minScore ${minScore}, minLead ${minLead}), on the scorer alone:`);
  console.log(scoreSide?`  best must-not-match top score with a passing lead: ${scoreSide.topScore} (${scoreSide.id}), ${(minScore-scoreSide.topScore).toFixed(2)} below minScore`:'  no must-not-match line has a passing lead');
  console.log(leadSide?`  best must-not-match lead with a passing score: ${leadSide.lead} (${leadSide.id}), ${(minLead-leadSide.lead).toFixed(2)} below minLead`:'  no must-not-match line has a passing score');
  const closest=CASES.filter(c=>c.expect==='no_match').map(c=>strict.results.find(r=>r.id===c.id)!).sort((a,b)=>b.topScore-a.topScore).slice(0,8);
  console.log('\nMust-not-match lines closest to matching (top score, lead):');
  for(const r of closest)console.log(`  ${r.id}: ${r.topSku??'-'} ${r.topScore}, lead ${r.lead}`);
  if(process.argv.includes('--cases')){
    for(const r of rows){
      console.log(`\n${r.label} / ${r.judge}`);
      for(const x of r.results)console.log(`  ${x.correct?' ':'!'} ${x.id.padEnd(28)} ${x.outcome==='matched'?`matched ${x.sku}`:`no match (${x.reason})`}`);
    }
  }
}
