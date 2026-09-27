import {readdirSync,readFileSync} from 'node:fs';
import {join,posix,resolve} from 'node:path';
import {describe,expect,it} from 'vitest';

// Dead CSS guard (task 7.1): every class the global stylesheets style is used by a component. The
// old supplier dashboard, the pre-2.4 customer sidebar, the login screen and the text-to-SQL
// "query" disclosure left rules behind that no page rendered. CSS modules are checked by
// TypeScript usage instead (an unknown key is undefined, and reviews catch it).

const ROOT=resolve(__dirname,'../..');
const STYLESHEETS=['src/app/globals.css','src/app/customer.css','src/app/persona.css'];
/** Classes built at runtime from a prefix (`cx-chip-${tone}`, `ip-stock-${tone}`). */
const DYNAMIC=[/^cx-chip-/,/^ip-stock-/];

function sources(dir:string):string[]{
  return readdirSync(join(ROOT,dir),{withFileTypes:true}).flatMap(entry=>{
    const path=posix.join(dir,entry.name);
    return entry.isDirectory()?sources(path):/\.tsx?$/.test(entry.name)&&!/\.test\.tsx?$/.test(entry.name)?[path]:[];
  });
}

/** Class names in the selectors of `css` (not in declarations, @media preludes or keyframes). */
export function styledClasses(css:string){
  const names=new Set<string>();
  for(const [,selector] of css.replace(/\/\*[\s\S]*?\*\//g,'').matchAll(/([^{};]+)\{/g)){
    const s=selector.trim();
    if(s.startsWith('@')||/^(?:from|to|\d+%)$/.test(s))continue;
    for(const [,name] of s.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g))names.add(name);
  }
  return names;
}

/** Everything code could put in a class attribute: className props and assignments, and DOM class lookups. */
export function classText(text:string){
  return [...text.matchAll(/className=(\{`[^`]*`\}|"[^"]*"|\{[^}]*\})|\.className\s*=\s*(['"`][^'"`]*['"`])|(?:querySelector(?:All)?|closest|classList\.\w+)\(([^)]*)\)/g)]
    .map(m=>m[1]??m[2]??m[3]).join('\n');
}

describe('global stylesheets',()=>{
  const used=sources('src').map(file=>classText(readFileSync(join(ROOT,file),'utf8'))).join('\n');

  it('style only classes a component uses',()=>{
    const unused=STYLESHEETS.flatMap(sheet=>[...styledClasses(readFileSync(join(ROOT,sheet),'utf8'))]
      .filter(name=>!DYNAMIC.some(p=>p.test(name))&&!new RegExp(`(?<![\\w-])${name}(?![\\w-])`).test(used)).map(name=>`${sheet}: .${name}`));
    expect(unused).toEqual([]);
  });

  it('read selectors and class attributes, not declarations or copy',()=>{
    expect([...styledClasses('.a,.b .c:hover{color:red}@media(max-width:800px){.d{margin:.5em}}@keyframes x{50%{opacity:.3}}')]).toEqual(['a','b','c','d']);
    expect(classText('<div className="chat-main"/><p className={`cx-chip ${x}`}>rep-item</p>')).toBe('"chat-main"\n{`cx-chip ${x}`}');
    expect(classText("canvas.className='qp-sheet';el.classList.add('open')")).toBe("'qp-sheet'\n'open'");
  });
});
