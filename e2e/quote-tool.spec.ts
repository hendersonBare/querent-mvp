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
  // The PDF's lines carry the customer's prices ("$1.10"): something besides the description, SKU and
  // quantity, so each quantity is kept and flagged (B10b), and the rep sets it.
  await expect(reviewLine(dialog,'12108-BDL')).toContainText('Check quantity (customer wrote: 10 bundles, $1.10)');
  await expect(qty(dialog,'12108-BDL')).toHaveValue('10');
  await expect(reviewLine(dialog,'PB3669')).toContainText('Check quantity (customer wrote: 2 cases, $89.00)');
  await expect(dialog.getByText('2 lines have a quantity to check.')).toBeVisible();
  await qty(dialog,'12108-BDL').fill('250');
  await qty(dialog,'PB3669').fill('2');
  await price(dialog,'12108-BDL').fill('1.10');
  await price(dialog,'PB3669').fill('89');
  // 250 each x $1.10, plus 2 cases x $89.
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
  // A neutral similarity per closest item (its value is the scorer's: 75% for the wrap under the final B3b scorer).
  await expect(unmatched.getByRole('table',{name:/Closest items/}).first()).toContainText(/Similarity.*\d{1,3}%/);
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
  await expect(dialog.getByText('Picked by rep')).toBeVisible();
  // The promoted line's price is focused and empty; Save waits for it.
  await expect(price(dialog,'SF188CAST')).toBeFocused();
  await expect(saveButton(dialog)).toBeDisabled();
  // The wrap is priced per case of 4 rolls. The rep's pick does not account for the whole line (the line
  // leaves its hand length unsaid), so the customer's 4 rolls are kept and flagged (B10b), not made 1 case.
  const wrap=reviewLine(dialog,'SF188CAST');
  await expect(qty(dialog,'SF188CAST')).toHaveValue('4');
  await expect(wrap.getByTestId('qty-unit')).toHaveText('cases');
  await expect(wrap.getByTestId('price-unit')).toHaveText('per case');
  await expect(wrap).toContainText('Check quantity (customer wrote: 4 rolls)');
  await expect(wrap).not.toContainText('Customer asked for');
  await shot(page,'03c-review-dialog-rep-pick-flagged');
  // The rep decides: 1 case.
  await qty(dialog,'SF188CAST').fill('1');
  await expect(wrap).toContainText('Customer wrote: 4 rolls');
  await price(dialog,'SF188CAST').fill('80');
  // 250 each x $1.25 + 1 case x $80.
  await expect(dialog.getByTestId('quote-total')).toHaveText('$392.50');
  await saveButton(dialog).click();

  await expect(page).toHaveURL(QUOTE_URL);
  await expect(itemRow(page,'SF188CAST')).toContainText('Picked by rep');
  await expect(itemRow(page,'SF188CAST')).toContainText(LINES.wrap);
  await expect(itemRow(page,'SF188CAST')).toContainText('$80.00');
  await expect(itemRow(page,'SF188CAST')).toContainText('1 case');
  await expect(itemRow(page,'12108-BDL')).not.toContainText('Picked by rep');
  await expect(page.getByTestId('quote-total')).toHaveText('$392.50');
  const id=new URL(page.url()).pathname.split('/').pop();
  const {quote}=await (await page.request.get(`/api/quotes/${id}`)).json();
  expect(quote.lines.map((l:{sku:string;matchedBy:string;quantity:number;unit:string;quantityUnclear:boolean})=>[l.sku,l.matchedBy,l.quantity,l.unit,l.quantityUnclear]))
    .toEqual([['12108-BDL','auto',250,'each',false],['SF188CAST','rep',1,'case',true]]);
});

test('a quantity it cannot convert is kept and flagged; Swap to an item priced per another unit converts again and clears the price',async({page})=>{
  const pallets=LINES.box.replace('10 bundles','10 pallets');
  await page.goto('/quote-tool');
  await list(page).fill([pallets,LINES.box].join('\n'));
  const dialog=await findMatches(page);
  await expect(dialog.getByText('2 matched, 0 could not be matched.')).toBeVisible();
  await dialog.getByLabel('Customer name').fill('E2E Units Co');

  // "10 pallets" of a box priced each: the number is kept, flagged with what the customer wrote, and
  // counted under Save, which stays allowed (the rep decides).
  const flagged=dialog.getByTestId('line-0');
  await expect(flagged.getByLabel('Quantity for 12108-BDL')).toHaveValue('10');
  await expect(flagged.getByTestId('qty-unit')).toHaveText('each');
  await expect(flagged).toContainText('Check quantity (customer wrote: 10 pallets)');
  await expect(dialog.getByText('1 line has a quantity to check.')).toBeVisible();
  await flagged.getByLabel('Unit price for 12108-BDL').fill('1.25');

  // Swap the second box line (10 bundles = 250 each, priced) for poly bags priced per case: the
  // conversion runs again from the customer's 10 bundles (not convertible to cases: flagged), the unit
  // labels change and the price is cleared.
  const swapped=dialog.getByTestId('line-1');
  await swapped.getByLabel('Unit price for 12108-BDL').fill('1.25');
  await expect(swapped.getByLabel('Quantity for 12108-BDL')).toHaveValue('250');
  await swapped.getByRole('button',{name:'Swap'}).click();
  await swapped.getByRole('searchbox',{name:'Search the catalog'}).fill('reclosable poly bags 30 x 30 2 mil');
  await swapped.getByRole('button',{name:/^Use PB3669,/}).click();
  await expect(swapped.getByLabel('Quantity for PB3669')).toHaveValue('10');
  await expect(swapped.getByLabel('Unit price for PB3669')).toHaveValue('');
  await expect(swapped.getByTestId('qty-unit')).toHaveText('cases');
  await expect(swapped.getByTestId('price-unit')).toHaveText('per case');
  await expect(swapped).toContainText('Check quantity (customer wrote: 10 bundles)');
  await expect(swapped).toContainText('Picked by rep');
  await expect(dialog.getByText('2 lines have a quantity to check.')).toBeVisible();
  await expect(saveButton(dialog)).toBeDisabled();
  await shot(page,'03d-review-dialog-check-quantity');

  await swapped.getByLabel('Unit price for PB3669').fill('90');
  // 10 each x $1.25 + 10 cases x $90.
  await expect(dialog.getByTestId('quote-total')).toHaveText('$912.50');
  await expect(saveButton(dialog)).toBeEnabled();
  await saveButton(dialog).click();

  // After save the flags stay visible on the quote's page, with what the customer wrote.
  await expect(page).toHaveURL(QUOTE_URL);
  await expect(itemRow(page,'12108-BDL')).toContainText('Quantity was flagged: customer wrote 10 pallets');
  await expect(itemRow(page,'PB3669')).toContainText('Quantity was flagged: customer wrote 10 bundles');
  await expect(page.getByTestId('quote-total')).toHaveText('$912.50');
  await shot(page,'08b-quote-detail-flagged');
  const id=new URL(page.url()).pathname.split('/').pop();
  const {quote}=await (await page.request.get(`/api/quotes/${id}`)).json();
  expect(quote.lines.map((l:{sku:string;quantity:number;unit:string;quantityUnclear:boolean;customerQuantity:string|null;matchedBy:string})=>[l.sku,l.quantity,l.unit,l.quantityUnclear,l.customerQuantity,l.matchedBy]))
    .toEqual([['12108-BDL',10,'each',true,'10 pallets','auto'],['PB3669',10,'case',true,'10 bundles','rep']]);
});

test('a pack size the customer states is kept: "Use this item" on a box bundled 25 for "50/bundle, 2 bundles" flags, never converts',async({page})=>{
  const line50='Corrugated Boxes 12x10x8 32 ECT 50/bundle, 2 bundles';
  await page.goto('/quote-tool');
  await list(page).fill([line50,LINES.box].join('\n'));
  const dialog=await findMatches(page);
  await expect(dialog.getByText('1 matched, 1 could not be matched.')).toBeVisible();
  await dialog.getByLabel('Customer name').fill('E2E Pack Co');

  // The second line (no stated pack) converts as before: 10 bundles = 250 each.
  await expect(dialog.getByTestId('line-1')).toContainText('Customer asked for 10 bundles = 250 each');
  await dialog.getByTestId('line-1').getByLabel('Unit price for 12108-BDL').fill('1.25');

  const unmatched=dialog.getByTestId('line-0');
  await expect(unmatched).toContainText(line50);
  await unmatched.getByRole('button',{name:/^Show \d closest items?$/}).click();
  await unmatched.getByTestId('near-miss').filter({hasText:'12108-BDL'}).getByRole('button',{name:'Use this item'}).click();

  // The customer's 2 bundles of 50 are not 2 bundles of 25 (the item does not account for "50/bundle"): the numbers are kept and flagged.
  const picked=dialog.getByTestId('line-0');
  await expect(picked.getByLabel('Quantity for 12108-BDL')).toHaveValue('2');
  await expect(picked.getByTestId('qty-unit')).toHaveText('each');
  await expect(picked).toContainText('Check quantity (customer wrote: 2 bundles)');
  await expect(picked).not.toContainText('Customer asked for');
  await expect(dialog.getByText('1 line has a quantity to check.')).toBeVisible();
  await shot(page,'03e-review-dialog-stated-pack');

  // The rep decides: 100 each, priced, saved; the quote's page still shows what the customer asked for.
  await picked.getByLabel('Quantity for 12108-BDL').fill('100');
  await expect(picked).toContainText('Customer wrote: 2 bundles');
  await picked.getByLabel('Unit price for 12108-BDL').fill('1.25');
  await expect(dialog.getByTestId('quote-total')).toHaveText('$437.50');
  await saveButton(dialog).click();

  await expect(page).toHaveURL(QUOTE_URL);
  const rows=page.getByRole('table',{name:'Items'}).getByRole('row').filter({hasText:'12108-BDL'});
  await expect(rows.filter({hasText:line50})).toContainText('Quantity was flagged: customer wrote 2 bundles');
  await expect(rows.filter({hasText:LINES.box})).toContainText('Customer asked for 10 bundles');
  await expect(page.getByTestId('quote-total')).toHaveText('$437.50');
  await shot(page,'08c-quote-detail-stated-pack');
  const id=new URL(page.url()).pathname.split('/').pop();
  const {quote}=await (await page.request.get(`/api/quotes/${id}`)).json();
  expect(quote.lines.map((l:{quantity:number;unit:string;quantityUnclear:boolean;customerQuantity:string|null;matchedBy:string})=>[l.quantity,l.unit,l.quantityUnclear,l.customerQuantity,l.matchedBy]))
    .toEqual([[100,'each',true,'2 bundles','rep'],[250,'each',false,'10 bundles','auto']]);
});

test('a pack the item does not account for is never converted: "Use this item" on a box bundled 25 for "bdl/50, 2 bundles" keeps 2 and flags it (B10b)',async({page})=>{
  const bdl='Corrugated Boxes 12x10x8 32 ECT bdl/50, 2 bundles';
  await page.goto('/quote-tool');
  await list(page).fill([bdl,LINES.box].join('\n'));
  const dialog=await findMatches(page);
  await expect(dialog.getByText('1 matched, 1 could not be matched.')).toBeVisible();
  await dialog.getByLabel('Customer name').fill('E2E Pack Wording Co');
  await dialog.getByTestId('line-1').getByLabel('Unit price for 12108-BDL').fill('1.25');

  const unmatched=dialog.getByTestId('line-0');
  await expect(unmatched).toContainText(bdl);
  await unmatched.getByRole('button',{name:/^Show \d closest items?$/}).click();
  await unmatched.getByTestId('near-miss').filter({hasText:'12108-BDL'}).getByRole('button',{name:'Use this item'}).click();

  // The item does not account for "bdl/50", so the customer's 2 bundles are not turned into 50 each.
  const picked=dialog.getByTestId('line-0');
  await expect(picked.getByLabel('Quantity for 12108-BDL')).toHaveValue('2');
  await expect(picked.getByTestId('qty-unit')).toHaveText('each');
  await expect(picked).toContainText('Check quantity (customer wrote: 2 bundles)');
  await expect(picked).not.toContainText('Customer asked for');
  await expect(dialog.getByText('1 line has a quantity to check.')).toBeVisible();
  await shot(page,'03f-review-dialog-unread-pack');

  // Saved as the rep left it (2 each), flagged, with the customer's words.
  await picked.getByLabel('Unit price for 12108-BDL').fill('1.25');
  await expect(dialog.getByTestId('quote-total')).toHaveText('$315.00');
  await saveButton(dialog).click();
  await expect(page).toHaveURL(QUOTE_URL);
  const rows=page.getByRole('table',{name:'Items'}).getByRole('row').filter({hasText:'12108-BDL'});
  await expect(rows.filter({hasText:bdl})).toContainText('Quantity was flagged: customer wrote 2 bundles');
  const id=new URL(page.url()).pathname.split('/').pop();
  const {quote}=await (await page.request.get(`/api/quotes/${id}`)).json();
  expect(quote.lines.map((l:{quantity:number;unit:string;quantityUnclear:boolean;customerQuantity:string|null;matchedBy:string})=>[l.quantity,l.unit,l.quantityUnclear,l.customerQuantity,l.matchedBy]))
    .toEqual([[2,'each',true,'2 bundles','rep'],[250,'each',false,'10 bundles','auto']]);
});

test('the verifier\'s silent lines flag: "pack size 50, 4 bundles" and "50 x 4 bundles" on a box bundled 25 keep 4 and flag, picked or matched (B10b)',async({page})=>{
  const packSize='S-4128 12x10x8 Corrugated Boxes 32 ECT, pack size 50, 4 bundles';
  const fiftyX='12x10x8 Corrugated Boxes 32 ECT 50 x 4 bundles';
  await page.goto('/quote-tool');
  await list(page).fill([packSize,fiftyX].join('\n'));
  const dialog=await findMatches(page);
  await dialog.getByLabel('Customer name').fill('E2E Silent Lines Co');
  for(const key of ['line-0','line-1']){
    const line=dialog.getByTestId(key);
    // Unmatched under Strict (the 50 is not accounted for): pick the box anyway.
    if(await line.getByRole('button',{name:/^Show \d closest items?$/}).count()){
      await line.getByRole('button',{name:/^Show \d closest items?$/}).click();
      await line.getByTestId('near-miss').filter({hasText:'12108-BDL'}).first().getByRole('button',{name:'Use this item'}).click();
    }
  }
  for(const key of ['line-0','line-1']){
    const line=dialog.getByTestId(key);
    await expect(line.getByLabel('Quantity for 12108-BDL')).toHaveValue('4');
    await expect(line.getByTestId('qty-unit')).toHaveText('each');
    await expect(line).toContainText('Check quantity (customer wrote: 4 bundles');
    await expect(line).not.toContainText('Customer asked for');
    await line.getByLabel('Unit price for 12108-BDL').fill('1');
  }
  await expect(dialog.getByText('2 lines have a quantity to check.')).toBeVisible();
  await shot(page,'03g-review-dialog-silent-lines-flagged');
  await saveButton(dialog).click();
  await expect(page).toHaveURL(QUOTE_URL);
  const id=new URL(page.url()).pathname.split('/').pop();
  const {quote}=await (await page.request.get(`/api/quotes/${id}`)).json();
  expect(quote.lines.map((l:{quantity:number;unit:string;quantityUnclear:boolean})=>[l.quantity,l.unit,l.quantityUnclear])).toEqual([[4,'each',true],[4,'each',true]]);
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
