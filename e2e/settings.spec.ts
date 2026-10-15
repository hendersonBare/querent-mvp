import {expect,test,type Page} from '@playwright/test';
import {LINES,shot} from './support/helpers';

// Settings (docs/boxt/plan.md B7): match strictness, Strict by default, saved for the whole company.
// The spec leaves it on Strict, which the other specs' expected outcomes assume.

const level=(page:Page,name:string)=>page.getByRole('radio',{name:new RegExp(`^${name}\\b`)});

/** A match run through the API: the level it ran at and the wrap line's outcome. */
async function runWrap(page:Page){
  const response=await page.request.post('/api/quote-tool/match',{multipart:{text:LINES.wrap}});
  expect(response.status()).toBe(200);
  const events=(await response.text()).trim().split('\n').map(line=>JSON.parse(line));
  const result=events.find(event=>event.type==='result');
  expect(result,JSON.stringify(events.at(-1))).toBeTruthy();
  return {level:result.run.level as string,outcome:result.run.lines[0].outcome as string};
}

test('change match strictness: it persists for new runs, then goes back to Strict',async({page})=>{
  try{
    await changeAndRestore(page);
  }finally{
    // Strict again whatever happened above.
    expect((await page.request.put('/api/settings',{data:{matchStrictness:'strict'}})).status()).toBe(200);
  }
});

async function changeAndRestore(page:Page){
  await page.goto('/settings');
  await expect(page.getByRole('heading',{name:'Match strictness'})).toBeVisible();
  await expect(level(page,'Strict')).toBeChecked();
  await expect(page.getByText('Other settings coming soon.')).toBeVisible();
  const save=page.getByRole('button',{name:'Save',exact:true});
  await expect(save).toBeDisabled();
  await shot(page,'07-settings');

  await level(page,'Balanced').check();
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.getByRole('status')).toHaveText('Saved. New match runs use Balanced.');
  await page.reload();
  await expect(level(page,'Balanced')).toBeChecked();
  expect(await (await page.request.get('/api/settings')).json()).toEqual({matchStrictness:'balanced'});
  // New runs use it: the stretch wrap line, No match under Strict, matches under Balanced.
  expect(await runWrap(page)).toEqual({level:'balanced',outcome:'matched'});

  await level(page,'Strict').check();
  await save.click();
  await expect(page.getByRole('status')).toHaveText('Saved. New match runs use Strict.');
  await page.reload();
  await expect(level(page,'Strict')).toBeChecked();
  expect(await (await page.request.get('/api/settings')).json()).toEqual({matchStrictness:'strict'});
  expect(await runWrap(page)).toEqual({level:'strict',outcome:'no_match'});
}
