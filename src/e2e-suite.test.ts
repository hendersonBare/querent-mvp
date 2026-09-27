import {readdirSync,readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {describe,expect,it} from 'vitest';

// The release gate (task 7.1): the golden quote flow runs in full, and so does every other E2E
// spec. A test or step switched off, or a focused test that silently drops the rest, fails here
// before CI's Playwright run would quietly pass without it.

const E2E=resolve(__dirname,'../e2e');

/**
 * Every way Playwright (1.63) switches a test or step off, focuses one, or expects it to fail:
 *   - a modifier on anything: test.skip / fixme / only / fail, test.fail.only, test.step.skip,
 *     test.describe.skip / fixme / only, describe.only, testInfo.skip / fixme / fail, called with
 *     or without a condition, or just referenced (const skip=test.skip);
 *   - the same by bracket access (test['skip']) or destructured from test or testInfo;
 *   - a test's details annotation of type skip, fixme or fail ({annotation:{type:'skip'}} skips it);
 *   - the word fixme anywhere.
 */
export const DISABLED=[
  /\.\s*(?:skip|fixme|only|fail)\b/,
  /\[\s*(['"`])(?:skip|fixme|only|fail)\1\s*\]/,
  /\{[^}]*\b(?:skip|fixme|only|fail)\b[^}]*\}\s*=\s*(?:test|testInfo|it|describe)\b/,
  /\btype\s*:\s*(['"`])(?:skip|fixme|fail)\1/,
  /\bfixme\b/i,
];
const disabled=(line:string)=>DISABLED.some(pattern=>pattern.test(line));

/**
 * The golden spec's tests, each by its title and tag: steps 1 to 8, step 6 as its rep half (3.7)
 * and its customer half (5.1). Each must be there exactly once, as its own test.
 */
export const GOLDEN_TESTS:readonly [title:string,tag:string|null][]=[
  ["0. Setup: fresh seed on the mockup's day, scripted chat, both personas signed in",null],
  ['1. Dana asks about stock → answer','@step1'],
  ['2. Dana asks for goods with one vague line','@step2'],
  ['3. Querent asks a clarifying question → Dana answers → item pop-up opens','@step3'],
  ['4. Dana presses Request quote → quote is ready_for_review','@step4'],
  ['5. Brandi opens it from the unread badge, switches a price basis, types a below-floor price → red warning','@step5'],
  ['6. Brandi Approve & send → Confirm (rep half)','@step6'],
  ['6. Dana receives it and opens the PDF preview (customer half)','@step6'],
  ['7. Dana Request changes (note) → Confirm → Brandi edits and sends rev 2','@step7'],
  ['8. Dana Accept (pickup time, PO) → Confirm → Brandi sees Accepted; both PDFs download and validate','@step8'],
];

/** The tests a spec declares, in order: `test("title", …)` or `test(\n  "title",\n  { tag: "@stepN", … }`, with the tag if it has one. */
export function declaredTests(text:string){
  return [...text.matchAll(/^test\(\s*(["'`])((?:\\.|(?!\1).)*)\1\s*,\s*(?:\{\s*tag:\s*(["'`])([^"'`]+)\3)?/gm)]
    .map(m=>({title:m[2].replace(/\\(.)/g,'$1'),tag:m[4]??null}));
}

describe('the E2E suite',()=>{
  const specs=readdirSync(E2E).filter(name=>name.endsWith('.spec.ts'));
  const golden=readFileSync(join(E2E,'golden-quote-flow.spec.ts'),'utf8');

  it('has every golden test, steps 1 to 8 with both halves of step 6, each once and in order',()=>{
    expect(specs).toContain('golden-quote-flow.spec.ts');
    expect(declaredTests(golden)).toEqual(GOLDEN_TESTS.map(([title,tag])=>({title,tag})));
  });

  it('switches no test or step off, focuses none, and expects none to fail',()=>{
    const found=specs.flatMap(name=>readFileSync(join(E2E,name),'utf8').split('\n')
      .flatMap((line,i)=>disabled(line)?[`e2e/${name}:${i+1}: ${line.trim()}`]:[]));
    expect(found).toEqual([]);
  });

  it('reads every way a test or step is switched off',()=>{
    for(const line of [
      'test.fixme("step 5", async () => {})','test.skip(true)','test.skip(process.env.CI, "flaky")','test.skip()','test.only("x", f)','test.fail("x", f)',
      'test.fail.only("x", f)','await test.step.skip("round 2", async () => {})','test.describe.skip("x", () => {})','test.describe.fixme("x", f)',
      'test.describe.only("x", f)','describe.only(','testInfo.skip(true, "later")','testInfo.fixme()','testInfo.fail()','const later = test.skip;',
      'test["skip"]("x", f)',"test['only'](","const { skip } = test;",'const {fixme,fail}=testInfo;',
      '{ tag: "@step6", annotation: { type: "skip" } },',"annotation: [{ type: 'fixme' }]",'annotation: { type: `fail`, description: "x" }',
      '// FIXME: turn this back on',
    ])expect(disabled(line),line).toBe(true);
    for(const line of [
      'test("skip the line", f)','await page.getByRole("button", { name: "Drop this line" }).click()','test.describe.configure({ mode: "serial" })',
      'annotation: { type: "task", description: "2.2 Clarification loop" }','await test.step("round 1: the question only", async () => {})',
      'expect(skipped).toBe(0)','const { title } = testInfo;','// Every step runs.',
    ])expect(disabled(line),line).toBe(false);
  });

  it('reads the tests a spec declares, with their tags',()=>{
    expect(declaredTests('test("0. Setup", async () => {});\ntest(\n  "6. Rep half",\n  { tag: "@step6", annotation: { type: "task" } },\n  async () => {},\n);\n  test("nested", f);'))
      .toEqual([{title:'0. Setup',tag:null},{title:'6. Rep half',tag:'@step6'}]);
  });
});
