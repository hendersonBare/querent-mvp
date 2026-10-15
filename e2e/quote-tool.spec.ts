import {join} from 'node:path';
import {expect,test,type Locator,type Page} from '@playwright/test';
import {LINES,REP,alert,shot} from './support/helpers';
import {ROOT} from './support/stack';

// The quote creation tool (docs/boxt/plan.md B5, B8; product rules 1 to 6) with the scripted parser
// and judge under Strict (the default after db:reset): paste or upload, match, review, price, save.

const SAMPLE_PDF=join(ROOT,'test/fixtures/sample-list.pdf');
const QUOTE_URL=/\/quotes\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const list=(page:Page)=>page.getByLabel(/Paste the customer.s list/);
const review=(page:Page)=>page.getByRole('dialog',{name:'Review quote'});
const price=(dialog:Locator,sku:string)=>dialog.getByLabel(`Unit price for ${sku}`);
const qty=(dialog:Locator,sku:string)=>dialog.getByLabel(`Quantity for ${sku}`);
/** A line in the review dialog, by the SKU of its item. */
const reviewLine=(dialog:Locator,sku:string)=>dialog.getByRole('listitem').filter({has:dialog.page().getByLabel(`Unit price for ${sku}`)});
const saveButton=(dialog:Locator)=>dialog.getByRole('button',{name:'Save quote'});
/** A saved quote's matched line, by SKU. */
const itemRow=(page:Page,sku:string)=>page.getByRole('table',{name:'Items'}).getByRole('row').filter({hasText:sku});

async function findMatches(page:Page){
  await page.getByRole('button',{name:'Find matches'}).click();
  await expect(review(page)).toBeVisible({timeout:60_000});
  return review(page);
}

test('paste, match, review, price and save: the quote opens with its lines and total',async({page})=>{
  await page.goto('/quote-tool');
  await list(page).fill([LINES.box,LINES.bags].join('\n'));
  await expect(page.getByText('2 of 200 lines')).toBeVisible();
  await shot(page,'02-quote-tool-input');

  const dialog=await findMatches(page);
  await expect(dialog.getByText('2 matched, 0 could not be matched.')).toBeVisible();
  await expect(dialog.getByText(`Customer wrote: ${LINES.box}`)).toBeVisible();
  await expect(dialog.getByText('12108-BDL',{exact:true})).toBeVisible();
  await expect(dialog.getByText('PB3669',{exact:true})).toBeVisible();
  // Prices are never prefilled (product rule 5).
  await expect(price(dialog,'12108-BDL')).toHaveValue('');
  await expect(price(dialog,'PB3669')).toHaveValue('');

  // One unit per line: the box is priced per box (web list $1.09/each) and sold in bundles of 25, so the
  // customer's 10 bundles become 250 each, said so under the quantity; the bags stay 2 cases.
  const box=reviewLine(dialog,'12108-BDL');
  await expect(qty(dialog,'12108-BDL')).toHaveValue('250');
  await expect(box.getByTestId('qty-unit')).toHaveText('each');
  await expect(box.getByTestId('price-unit')).toHaveText('per each');
  await expect(box).toContainText('Customer asked for 10 bundles = 250 each');
  await expect(box).toContainText('Web list: $1.09/each');
  const bags=reviewLine(dialog,'PB3669');
  await expect(qty(dialog,'PB3669')).toHaveValue('2');
  await expect(bags.getByTestId('qty-unit')).toHaveText('cases');
  await expect(bags.getByTestId('price-unit')).toHaveText('per case');
  await expect(bags).toContainText('Web list: $222.26/case');

  // Save stays disabled until every matched line has a price, and says why.
  await expect(saveButton(dialog)).toBeDisabled();
  await dialog.getByLabel('Customer name').fill('E2E Paste Co');
  await dialog.getByLabel('Reference').fill('PO-1001');
  await price(dialog,'12108-BDL').fill('1.25');
  await expect(box).toContainText('$312.50'); // 250 each x $1.25 per each
  await expect(saveButton(dialog)).toBeDisabled();
  await price(dialog,'PB3669').fill('90');
  await expect(dialog.getByTestId('quote-total')).toHaveText('$492.50');
  await shot(page,'03-review-dialog');
  await expect(saveButton(dialog)).toBeEnabled();
  await saveButton(dialog).click();

  await expect(page).toHaveURL(QUOTE_URL);
  await expect(page.getByRole('heading',{level:1,name:'E2E Paste Co'})).toBeVisible();
  await expect(page.getByText('PO-1001')).toBeVisible();
  await expect(page.locator('dl')).toContainText(REP); // Created by
  const cells=async(sku:string)=>(await itemRow(page,sku).getByRole('cell').allInnerTexts()).map(t=>t.replace(/\s+/g,' ').trim());
  expect((await cells('12108-BDL')).slice(2)).toEqual(['250 each','$1.25 per each','$312.50']);
  await expect(itemRow(page,'12108-BDL')).toContainText(LINES.box);
  expect((await cells('PB3669')).slice(2)).toEqual(['2 cases','$90.00 per case','$180.00']);
  await expect(page.getByTestId('quote-total')).toHaveText('$492.50');

  // The API agrees: two auto-matched lines, quantities in each item's pricing unit, the unit saved with them.
  const id=new URL(page.url()).pathname.split('/').pop();
  const {quote}=await (await page.request.get(`/api/quotes/${id}`)).json();
  expect(quote.lines.map((l:{sku:string;quantity:number;unit:string;unitPrice:number;matchedBy:string;unmatched:boolean})=>[l.sku,l.quantity,l.unit,l.unitPrice,l.matchedBy,l.unmatched]))
    .toEqual([['12108-BDL',250,'each',1.25,'auto',false],['PB3669',2,'case',90,'auto',false]]);
  expect(quote.total).toBe(492.5);
});

test('a PDF upload is read, matched and saved with its unmatched lines flagged',async({page})=>{
  await page.goto('/quote-tool');
  await page.getByLabel('Upload PDF').setInputFiles(SAMPLE_PDF);
  await expect(page.getByText('sample-list.pdf')).toBeVisible();
  await expect(list(page)).toHaveCount(0);

  const dialog=await findMatches(page);
  await expect(dialog.getByText('2 matched, 2 could not be matched.')).toBeVisible();
  await expect(dialog.getByText('Could not detect a match')).toHaveCount(2);
  await dialog.getByLabel('Customer name').fill('E2E PDF Co');
  await price(dialog,'12108-BDL').fill('1.10');
  await price(dialog,'PB3669').fill('89');
  // 10 bundles = 250 each x $1.10, plus 2 cases x $89.
  await expect(dialog.getByTestId('quote-total')).toHaveText('$453.00');
  await saveButton(dialog).click();

  await expect(page).toHaveURL(QUOTE_URL);
  await expect(page.getByRole('heading',{level:1,name:'E2E PDF Co'})).toBeVisible();
  await expect(itemRow(page,'12108-BDL')).toContainText('$275.00');
  await expect(itemRow(page,'PB3669')).toContainText('$178.00');
  await expect(page.getByTestId('quote-total')).toHaveText('$453.00');
  const unmatched=page.getByRole('region',{name:/Unmatched lines/});
  await expect(unmatched).toContainText('Kraft Packing Paper Roll 36"');
  await expect(unmatched).toContainText('Cast Stretch Wrap 18" x 1500\' 80 Gauge');
  await expect(unmatched.getByRole('table',{name:/Closest items/}).first()).toBeVisible();
  await expect(unmatched.getByRole('table',{name:/Closest items/}).first()).toContainText('100%');
  await expect(unmatched).toContainText('Qty 4 rolls');
  await shot(page,'08-quote-detail-unmatched');
});

test('an unmatched line: open its closest items, use one, price it and save it as picked by the rep',async({page})=>{
  await page.goto('/quote-tool');
  await list(page).fill([LINES.box,LINES.wrap].join('\n'));
  const dialog=await findMatches(page);
  await expect(dialog.getByText('1 matched, 1 could not be matched.')).toBeVisible();

  const line=dialog.getByRole('listitem').filter({hasText:'Could not detect a match'});
  await expect(line).toContainText(LINES.wrap);
  await line.getByRole('button',{name:/^Show \d closest items?$/}).click();
  const misses=line.getByRole('list',{name:'Closest items'}).getByTestId('near-miss');
  await expect(misses.first()).toContainText('SF188CAST');
  expect(await misses.count()).toBeGreaterThanOrEqual(3);
  await dialog.getByLabel('Customer name').fill('E2E Near-miss Co');
  await price(dialog,'12108-BDL').fill('1.25');
  await shot(page,'03b-review-dialog-closest-items');

  // Closest items show a neutral similarity, never "100% match".
  await expect(misses.first()).toContainText(/Similarity \d+%/);
  await expect(line).not.toContainText('% match');

  await misses.filter({hasText:'SF188CAST'}).getByRole('button',{name:'Use this item'}).click();
  await expect(dialog.getByText('2 matched, 0 could not be matched.')).toBeVisible();
  await expect(dialog.getByText('Picked by you')).toBeVisible();
  // The promoted line's price is focused and empty; Save waits for it.
  await expect(price(dialog,'SF188CAST')).toBeFocused();
  await expect(saveButton(dialog)).toBeDisabled();
  // The wrap is priced per case of 4; "4 rolls" cannot be converted exactly, so it stays 4 and is flagged.
  const wrap=reviewLine(dialog,'SF188CAST');
  await expect(qty(dialog,'SF188CAST')).toHaveValue('4');
  await expect(wrap).toContainText('Check quantity (customer wrote: 4 rolls)');
  await qty(dialog,'SF188CAST').fill('1');
  await expect(wrap).toContainText('Customer wrote: 4 rolls');
  await expect(wrap.getByTestId('qty-unit')).toHaveText('case');
  await price(dialog,'SF188CAST').fill('80');
  // 250 each x $1.25 + 1 case x $80.
  await expect(dialog.getByTestId('quote-total')).toHaveText('$392.50');
  await saveButton(dialog).click();

  await expect(page).toHaveURL(QUOTE_URL);
  await expect(itemRow(page,'SF188CAST')).toContainText('Matched by rep');
  await expect(itemRow(page,'SF188CAST')).toContainText(LINES.wrap);
  await expect(itemRow(page,'SF188CAST')).toContainText('$80.00');
  await expect(itemRow(page,'SF188CAST')).toContainText('1 case');
  await expect(itemRow(page,'12108-BDL')).not.toContainText('Matched by rep');
  await expect(page.getByTestId('quote-total')).toHaveText('$392.50');
  const id=new URL(page.url()).pathname.split('/').pop();
  const {quote}=await (await page.request.get(`/api/quotes/${id}`)).json();
  expect(quote.lines.map((l:{sku:string;matchedBy:string;quantity:number;unit:string;quantityUnclear:boolean})=>[l.sku,l.matchedBy,l.quantity,l.unit,l.quantityUnclear]))
    .toEqual([['12108-BDL','auto',250,'each',false],['SF188CAST','rep',1,'case',true]]);
});

test('a list over 200 lines is refused before anything is sent, here and by the API',async({page})=>{
  await page.goto('/quote-tool');
  const lines=Array.from({length:201},(_,i)=>`${i+1} x 12x10x8 corrugated boxes`).join('\n');
  await list(page).fill(lines);
  await expect(alert(page)).toHaveText('This list has 201 lines. The limit is 200, so split it into smaller lists.');
  await expect(page.getByRole('button',{name:'Find matches'})).toBeDisabled();

  const response=await page.request.post('/api/quote-tool/match',{multipart:{text:lines}});
  expect(response.status()).toBe(413);
});
