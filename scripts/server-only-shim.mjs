// Lets a script outside Next import modules guarded by `import 'server-only'` (src/server/llm):
// Next resolves that package itself, so it isn't installed; this resolves it to Next's empty module.
// Used as `tsx --import ./scripts/server-only-shim.mjs <script>` (npm run eval:record).
import {registerHooks} from 'node:module';

const EMPTY=new URL('../node_modules/next/dist/compiled/server-only/empty.js',import.meta.url).href;

registerHooks({
  resolve(specifier,context,next){
    if(specifier==='server-only')return {url:EMPTY,format:'commonjs',shortCircuit:true};
    return next(specifier,context);
  },
});
