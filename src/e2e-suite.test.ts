import {existsSync,mkdirSync,mkdtempSync,readdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {describe,expect,it} from 'vitest';

// The release gate (task 7.1): every E2E spec runs in full. A test or step switched off, or a focused
// test that silently drops the rest, fails here before CI's Playwright run would quietly pass without
// it. The guard holds with no e2e/ folder too (task B8 writes the BOXT specs).

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

/** Every spec and setup file (*.spec.ts, *.setup.ts) under e2e/, at any depth (none until task B8 writes them). */
export function specFiles(dir=E2E,prefix=''):string[]{
  if(!existsSync(dir))return [];
  return readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()
    ?specFiles(join(dir,entry.name),`${prefix}${entry.name}/`)
    :/\.(?:spec|setup)\.[cm]?[jt]sx?$/.test(entry.name)?[`${prefix}${entry.name}`]:[]);
}

/** Every line in the specs under `dir` that switches a test off, as "e2e/<spec>:<line>: <text>". */
export const disabledLines=(dir=E2E)=>specFiles(dir).flatMap(name=>readFileSync(join(dir,name),'utf8').split('\n')
  .flatMap((line,i)=>disabled(line)?[`e2e/${name}:${i+1}: ${line.trim()}`]:[]));

describe('the E2E suite',()=>{
  it('switches no test or step off, focuses none, and expects none to fail',()=>{
    expect(disabledLines()).toEqual([]);
  });

  it('reads the setup projects as well as the specs',()=>{
    expect(specFiles()).toEqual(expect.arrayContaining(['auth.setup.ts','quote-tool.spec.ts']));
  });

  it('finds a switched-off test in any spec, at any depth, and passes with no e2e/ folder',()=>{
    const dir=mkdtempSync(join(tmpdir(),'e2e-guard-'));
    try{
      expect(disabledLines(join(dir,'missing'))).toEqual([]);
      mkdirSync(join(dir,'auth'));
      writeFileSync(join(dir,'quote.spec.ts'),'test("saves", async () => {});\n');
      writeFileSync(join(dir,'auth','login.spec.ts'),'test("logs in", f);\ntest.only("x", f);\n');
      writeFileSync(join(dir,'notes.md'),'test.skip is not a spec');
      writeFileSync(join(dir,'auth.setup.ts'),'setup("signs in", f);\nsetup.skip("later", f);\n');
      writeFileSync(join(dir,'global-setup.ts'),'export default async () => {};\n');
      expect(disabledLines(dir).sort()).toEqual(['e2e/auth.setup.ts:2: setup.skip("later", f);','e2e/auth/login.spec.ts:2: test.only("x", f);']);
    }finally{rmSync(dir,{recursive:true,force:true});}
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
});
