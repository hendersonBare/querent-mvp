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
    {unmatched:false,sku:'12108-BDL',matchedBy:'auto',originalText:LINES.box,quantity:10,unit:'bundle',unitPrice:1.25},
    {unmatched:true,originalText:'Foam peanuts 14 cu ft, 3 bags',quantity:3,unit:null,nearMisses:[]},
  ],
});

const itemRow=(page:Page,sku:string)=>page.getByRole('table',{name:'Items'}).getByRole('row').filter({hasText:sku});

test('edit a quantity and a unit price: the total follows as you type and the change persists',async({page})=>{
  const id=await createQuote(page.request,quoteBody('E2E Edit Co'));
  await page.goto(`/quotes/${id}`);
  await expect(page.getByRole('heading',{level:1,name:'E2E Edit Co'})).toBeVisible();
  await expect(page.getByTestId('quote-total')).toHaveText('$12.50');
  await expect(page.getByRole('region',{name:/Unmatched lines/})).toContainText('Foam peanuts 14 cu ft, 3 bags');
  await shot(page,'05-quote-detail');

  await page.getByRole('button',{name:'Edit quote'}).click();
  await page.getByLabel('Quantity for 12108-BDL').fill('12');
  await page.getByLabel('Unit price for 12108-BDL').fill('1.5');
  await expect(page.getByTestId('quote-total')).toHaveText('$18.00');
  await page.getByLabel('Unit price for 12108-BDL').fill('abc');
  await expect(page.getByRole('button',{name:'Save changes'})).toBeDisabled();
  await page.getByLabel('Unit price for 12108-BDL').fill('1.5');
  await page.getByRole('button',{name:'Save changes'}).click();

  await expect(page.getByRole('button',{name:'Edit quote'})).toBeVisible();
  await expect(itemRow(page,'12108-BDL')).toContainText('$1.50');
  await expect(itemRow(page,'12108-BDL')).toContainText('$18.00');
  await expect(page.getByTestId('quote-total')).toHaveText('$18.00');

  await page.reload();
  await expect(itemRow(page,'12108-BDL')).toContainText('12');
  await expect(page.getByTestId('quote-total')).toHaveText('$18.00');
  const {quote}=await (await page.request.get(`/api/quotes/${id}`)).json();
  expect(quote.lines[0]).toMatchObject({sku:'12108-BDL',quantity:12,unitPrice:1.5});
  expect(quote.total).toBe(18);
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
  await expect(page.getByText('Example',{exact:true})).toBeVisible();
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
