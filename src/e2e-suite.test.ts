import {readdirSync,readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {describe,expect,it} from 'vitest';

// The release gate (task 7.1): the golden quote flow runs in full, and so does every other E2E
// spec. A step switched off with test.fixme / test.skip, or a focused test.only that silently
// drops the rest, fails here before CI's Playwright run would quietly pass without it.

const E2E=resolve(__dirname,'../e2e');
/** test.fixme / test.skip / test.only / describe.skip / describe.only, called or chained (test.describe.fixme). */
export const DISABLED=/\b(?:test|describe|it)(?:\.describe)?\.(?:fixme|skip|only)\s*\(/;

describe('the E2E suite',()=>{
  const specs=readdirSync(E2E).filter(name=>name.endsWith('.spec.ts'));

  it('has the golden quote flow, with every workflow step 1 to 8',()=>{
    expect(specs).toContain('golden-quote-flow.spec.ts');
    const golden=readFileSync(join(E2E,'golden-quote-flow.spec.ts'),'utf8');
    for(const step of [1,2,3,4,5,6,7,8])expect(golden,`step ${step}`).toMatch(new RegExp(`@step${step}\\b`));
  });

  it('switches no test off and focuses none',()=>{
    const found=specs.flatMap(name=>readFileSync(join(E2E,name),'utf8').split('\n')
      .flatMap((line,i)=>DISABLED.test(line)||/\bfixme\b/i.test(line)?[`e2e/${name}:${i+1}: ${line.trim()}`]:[]));
    expect(found).toEqual([]);
  });

  it('reads the ways a test is switched off',()=>{
    for(const line of ['test.fixme("step 5", async () => {})','test.skip(true)','test.describe.skip("x", () => {})','test.only("x", f)','describe.only(']) expect(DISABLED.test(line),line).toBe(true);
    for(const line of ['test("skip the line", f)','await page.skipLink()','test.describe.configure({ mode: "serial" })']) expect(DISABLED.test(line),line).toBe(false);
  });
});
