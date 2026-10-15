// Text normalizing shared by the packaging parser (packaging.ts): one spelling for fractions, quote
// marks and the "x" between dimensions, and one singular for plurals. Pure, with no server imports.

const FRACTIONS:Record<string,string>={'½':'1/2','¼':'1/4','¾':'3/4','⅛':'1/8','⅜':'3/8','⅝':'5/8','⅞':'7/8','⅓':'1/3','⅔':'2/3'};

/** Lower case, full-width forms (＂, ｘ, １２) made ASCII, unicode fractions spelled out (keeping mixed numbers together), curly quotes and × made plain, "a x b" spaced. */
export function normalize(text:string){
  return text.replace(/[！-～]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xFEE0)).toLowerCase()
    .replace(/[⁄∕]/g,'/')
    .replace(/(\d)\s*([½¼¾⅛⅜⅝⅞⅓⅔])/g,(_,d:string,f:string)=>`${d}-${FRACTIONS[f]}`)
    .replace(/[½¼¾⅛⅜⅝⅞⅓⅔]/g,f=>FRACTIONS[f])
    .replace(/[“”″]/g,'"').replace(/[‘’′]/g,"'").replace(/×/g,' x ')
    .replace(/(\d|")\s*x\s*(?=[\d.])/g,'$1 x ')
    .replace(/\s+/g,' ').trim();
}

/** Plural to singular, the same way for the customer's words and the catalog's: boxes -> box, supplies -> supply. */
export function stem(word:string){
  if(word.length<=3)return word;
  if(word.endsWith('ies'))return `${word.slice(0,-3)}y`;
  if(/(?:ss|sh|ch|x)es$/.test(word))return word.slice(0,-2);
  if(/(?:ss|us|is)$/.test(word))return word;
  return word.endsWith('s')?word.slice(0,-1):word;
}
