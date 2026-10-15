import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe,expect,it} from 'vitest';

// The dialogs (the review dialog and the delete dialog) use the Querent palette from src/app/tokens.css:
// the accent green for Save quote, Swap, focused inputs, Use this item and tags, never a colour of their own.

const ROOT=join(__dirname,'../../..');
const FILES=['src/components/ui/Dialog.module.css','src/features/quote-tool/QuoteReviewDialog.module.css'];
const withoutComments=(css:string)=>css.replace(/\/\*[\s\S]*?\*\//g,'');

describe('the dialogs\' palette',()=>{
  it.each(FILES)('%s names no colour of its own (only var(--q-*) tokens, white and transparent)',file=>{
    const css=withoutComments(readFileSync(join(ROOT,file),'utf8'));
    expect(css.match(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/gi)??[]).toEqual([]);
  });

  it('takes the accent from the Querent accent token',()=>{
    const css=readFileSync(join(ROOT,FILES[0]),'utf8');
    expect(css).toMatch(/--dlg-accent:\s*var\(--q-accent\);/);
    expect(css).toMatch(/--dlg-focus:\s*var\(--q-accent\);/);
  });
});
