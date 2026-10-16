import {readdirSync,readFileSync} from 'node:fs';
import {join,relative} from 'node:path';
import {describe,expect,it} from 'vitest';

// Every stylesheet under src/ uses the Querent palette from src/app/tokens.css (the only file that names
// colours): the accent green for Save quote, Swap, focused inputs, Use this item and tags, never a
// colour of its own. Keywords (white, transparent, currentColor, inherit) are fine.

const ROOT=join(__dirname,'../../..');
const SRC=join(ROOT,'src');
const TOKENS='src/app/tokens.css';

function stylesheets(dir:string):string[]{
  return readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()
    ?stylesheets(join(dir,entry.name))
    :entry.name.endsWith('.css')?[relative(ROOT,join(dir,entry.name)).split('\\').join('/')]:[]);
}
const withoutComments=(css:string)=>css.replace(/\/\*[\s\S]*?\*\//g,'');
const colours=(css:string)=>withoutComments(css).match(/#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/gi)??[];

describe('the palette',()=>{
  const files=stylesheets(SRC).filter(file=>file!==TOKENS);

  it('finds the stylesheets (the CSS modules and globals.css)',()=>{
    expect(files).toEqual(expect.arrayContaining(['src/components/ui/Dialog.module.css','src/features/quote-tool/QuoteReviewDialog.module.css','src/features/quote-tool/QuoteTool.module.css','src/app/globals.css']));
    expect(files.length).toBeGreaterThan(10);
  });

  it('names no colour outside the token file (only var(--q-*) tokens and keywords)',()=>{
    const found=files.flatMap(file=>colours(readFileSync(join(ROOT,file),'utf8')).map(colour=>`${file}: ${colour}`));
    expect(found).toEqual([]);
  });

  it('takes the dialogs\' accent from the Querent accent token',()=>{
    const css=readFileSync(join(ROOT,'src/components/ui/Dialog.module.css'),'utf8');
    expect(css).toMatch(/--dlg-accent:\s*var\(--q-accent\);/);
    expect(css).toMatch(/--dlg-focus:\s*var\(--q-accent\);/);
  });
});
