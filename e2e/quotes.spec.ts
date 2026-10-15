import {expect,test,type Page} from '@playwright/test';
import {LINES,createQuote,exampleQuoteId,shot} from './support/helpers';

// Saved quotes (docs/boxt/plan.md B6, B8; product rule 6): the list, a quote's page, editing quantities
// and prices, deleting with a confirm, and the example quote, which can be neither edited nor deleted.

/** A quote with one priced matched line and one unmatched line, saved through the API. */
const quoteBody=(customerName:string)=>({
  customerName,
  reference:'E2E-REF',
  matchStrictness:'strict',
  lines:[
    // 10 bundles of 25 = 250 each: the box is priced per box.
    {unmatched:false,sku:'12108-BDL',matchedBy:'auto',originalText:LINES.box,quantity:250,unit:'each',unitPrice:1.25},
    {unmatched:true,originalText:'Foam peanuts 14 cu ft, 3 bags',quantity:3,unit:null,nearMisses:[]},
  ],
});

const itemRow=(page:Page,sku:string)=>page.getByRole('table',{name:'Items'}).getByRole('row').filter({hasText:sku});

/** A matched row's Qty, Unit price and Line total cells, as shown. */
const amounts=async(page:Page,sku:string)=>(await itemRow(page,sku).getByRole('cell').allInnerTexts()).slice(2,5).map(t=>t.replace(/\s+/g,' ').trim());

test('edit the customer, reference, a quantity and a unit price: the total follows as you type and the change persists',async({page})=>{
  const id=await createQuote(page.request,quoteBody('E2E Edit Co'));
  await page.goto(`/quotes/${id}`);
  await expect(page.getByRole('heading',{level:1,name:'E2E Edit Co'})).toBeVisible();
  await expect(page.getByTestId('quote-total')).toHaveText('$312.50');
  expect(await amounts(page,'12108-BDL')).toEqual(['250 each','$1.25 per each','$312.50']);
  await expect(page.getByRole('region',{name:/Unmatched lines/})).toContainText('Foam peanuts 14 cu ft, 3 bags');
  await shot(page,'05-quote-detail');

  await page.getByRole('button',{name:'Edit quote'}).click();
  await page.getByRole('textbox',{name:'Customer'}).fill('E2E Edited Co');
  await page.getByRole('textbox',{name:'Reference'}).fill('E2E-REF-2');
  await expect(itemRow(page,'12108-BDL')).toContainText('per each');
  await page.getByLabel('Quantity for 12108-BDL').fill('300');
  await page.getByLabel('Unit price for 12108-BDL').fill('1.5');
  await expect(page.getByTestId('quote-total')).toHaveText('$450.00');
  await page.getByLabel('Unit price for 12108-BDL').fill('abc');
  await expect(page.getByRole('button',{name:'Save changes'})).toBeDisabled();
  await page.getByLabel('Unit price for 12108-BDL').fill('1.5');
  await shot(page,'05b-quote-detail-editing');
  await page.getByRole('button',{name:'Save changes'}).click();

  await expect(page.getByRole('button',{name:'Edit quote'})).toBeVisible();
  await expect(page.getByRole('heading',{level:1,name:'E2E Edited Co'})).toBeVisible();
  await expect(page.locator('dl')).toContainText('E2E-REF-2');
  expect(await amounts(page,'12108-BDL')).toEqual(['300 each','$1.50 per each','$450.00']);
  await expect(page.getByTestId('quote-total')).toHaveText('$450.00');

  await page.reload();
  await expect(page.getByRole('heading',{level:1,name:'E2E Edited Co'})).toBeVisible();
  await expect(page.locator('dl')).toContainText('E2E-REF-2');
  expect(await amounts(page,'12108-BDL')).toEqual(['300 each','$1.50 per each','$450.00']);
  await expect(page.getByTestId('quote-total')).toHaveText('$450.00');
  const {quote}=await (await page.request.get(`/api/quotes/${id}`)).json();
  expect(quote).toMatchObject({customerName:'E2E Edited Co',reference:'E2E-REF-2'});
  expect(quote.lines[0]).toMatchObject({sku:'12108-BDL',quantity:300,unit:'each',unitPrice:1.5});
  expect(quote.total).toBe(450);
});

test('delete a quote: it asks first, then the quote is gone from the list and its page is 404',async({page})=>{
  const id=await createQuote(page.request,quoteBody('E2E Delete Co'));
  await page.goto('/quotes');
  await expect(page.getByRole('link',{name:'E2E Delete Co'})).toBeVisible();
  await page.getByRole('link',{name:'E2E Delete Co'}).click();
  await expect(page).toHaveURL(new RegExp(`/quotes/${id}$`));

  await page.getByRole('button',{name:'Delete',exact:true}).click();
  const confirm=page.getByRole('alertdialog',{name:'Delete this quote?'});
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button',{name:'Cancel'}).click();
  await expect(confirm).toBeHidden();
  await expect(page).toHaveURL(new RegExp(`/quotes/${id}$`));

  await page.getByRole('button',{name:'Delete',exact:true}).click();
  await confirm.getByRole('button',{name:'Delete quote'}).click();
  await expect(page).toHaveURL(/\/quotes$/);
  await expect(page.getByRole('table',{name:'Quotes'})).toBeVisible();
  await expect(page.getByRole('link',{name:'E2E Delete Co'})).toHaveCount(0);

  const gone=await page.goto(`/quotes/${id}`);
  expect(gone?.status()).toBe(404);
  await expect(page.getByRole('heading',{name:'Quote not found'})).toBeVisible();
  expect((await page.request.get(`/api/quotes/${id}`)).status()).toBe(404);
});

test('the example quote is tagged, offers no Edit or Delete, and the API refuses to change it (409)',async({page})=>{
  const id=await exampleQuoteId();
  await page.goto('/quotes');
  const row=page.getByRole('table',{name:'Quotes'}).getByRole('row').filter({has:page.getByRole('link',{name:/.+/})}).filter({hasText:'Example'});
  await expect(row).toHaveCount(1);
  await shot(page,'04-quotes-list');

  await row.getByRole('link').click();
  await expect(page).toHaveURL(new RegExp(`/quotes/${id}$`));
  await expect(page.getByRole('heading',{level:1}).locator('xpath=..').getByText('Example',{exact:true})).toBeVisible();
  // The seeded example has no user: its creator reads "Example", never "None".
  await expect(page.locator('dl > div').filter({hasText:'Created by'}).locator('dd')).toHaveText('Example');
  await expect(page.getByText('None',{exact:true})).toHaveCount(0);
  await expect(page.getByText('This example can\'t be edited or deleted.')).toBeVisible();
  await expect(page.getByRole('button',{name:'Edit quote'})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Delete',exact:true})).toHaveCount(0);
  await shot(page,'06-example-quote');

  const removed=await page.request.delete(`/api/quotes/${id}`);
  expect(removed.status()).toBe(409);
  expect(await removed.json()).toEqual({error:'The example quote can\'t be deleted.'});
  const edited=await page.request.patch(`/api/quotes/${id}`,{data:{customerName:'Changed'}});
  expect(edited.status()).toBe(409);
  expect((await page.request.get(`/api/quotes/${id}`)).status()).toBe(200);
  await page.reload();
  await expect(page.getByText('This example can\'t be edited or deleted.')).toBeVisible();
});
