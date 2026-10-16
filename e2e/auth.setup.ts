import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {expect,test as setup} from '@playwright/test';
import {REP,devPassword} from './support/helpers';

// Signs in as the dev user once, through the login API, and saves the session for the specs
// (playwright.config.ts: storageState). Specs that need no session start from an empty context.
const STATE='e2e/.auth/rep.json';

setup('sign in as the dev user',async({page})=>{
  mkdirSync(dirname(STATE),{recursive:true});
  const response=await page.request.post('/api/auth/login',{data:{email:REP,password:devPassword(),next:'/quote-tool'}});
  expect(response.status()).toBe(200);
  await page.goto('/quote-tool');
  await expect(page.getByRole('button',{name:'Find matches'})).toBeVisible();
  await page.context().storageState({path:STATE});
});
