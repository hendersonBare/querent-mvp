import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

// Snapshots BOXT Packaging's public catalog (boxtpackaging.com, a Shopify store) into the seed:
// one row per variant that has a SKU, with the site's title wording and price. The seed reads the
// JSON this writes and never the network. Run: npx tsx scripts/fetch-boxt-catalog.ts

const SITE='https://boxtpackaging.com';
const OUT=resolve('src/server/db/seed/boxt-catalog.json');

/** Shopify product_type -> seed category id, in the site's menu order. */
const CATEGORY:Record<string,string>={
  'Boxes':'boxes','Mailers':'mailers','Tape & Strapping':'tape','Bags':'bags','Stretch Wrap':'stretch-wrap',
  'Bubble, Foam & Cushioning':'cushioning','Paper & Kraft':'paper','Labels':'labels','Storage & Fulfillment':'storage',
};

interface Variant{sku:string|null;title:string;price:string}
interface Product{title:string;handle:string;product_type:string;tags:string[];body_html:string;variants:Variant[]}
export interface BoxtRow{sku:string;description:string;category:string;pack:string;caseQty:number;list:number;keywords:string}

const COLORS=['black','white','clear','red','blue','yellow','green','orange','pink','purple','gold','silver','kraft','teal'];
/** A tag naming a hue the variant isn't (the colored mailers are tagged with every color) is dropped. */
const HUES=['black','red','blue','yellow','green','orange','pink','purple','gold','silver','teal','lavender'];
const text=(html:string)=>html.replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim();
const has=(haystack:string,needle:string)=>haystack.toLowerCase().includes(needle.toLowerCase().trim());

/** The site's title with the product noun first: `16x12x12" Heavy Duty Boxes` -> `Heavy Duty Boxes 16x12x12"`. */
function nounFirst(title:string){
  const [first,...rest]=title.replace(/\s+—\s+/g,', ').split(', ');
  const m=/^(.*?)(\d[\d./]*(?:x[\d./]+)*")\s+(\D.*)$/.exec(first);
  const head=m?`${m[1]}${m[3]} ${m[2]}`.replace(/\s+/g,' ').trim():first;
  return [head,...rest].join(', ');
}

function describe(product:Product,variant:Variant,body:string){
  let description=nounFirst(product.title.trim());
  if(product.variants.length>1&&variant.title!=='Default Title'){
    // Boxes are priced by the box at bundle or pallet volume: "bundle pricing", so a box never reads as a bundle of them.
    const parts=variant.title.split(/\s+[—/-]\s+/).map(p=>p.trim()).filter(p=>p&&!has(description,p)).map(p=>/^(bundle|pallet)$/i.test(p)?`${p.toLowerCase()} pricing`:p);
    if(parts.length)description+=`, ${parts.join(', ')}`;
  }
  // "Black Poly Strapping ..., White": the variant's color wins over a generic leading one.
  const lead=description.split(' ')[0].toLowerCase();
  if(COLORS.includes(lead)&&COLORS.some(c=>c!==lead&&new RegExp(`\\b${c}\\b`,'i').test(description.slice(lead.length))))description=description.slice(lead.length+1).replace(/^\w/,c=>c.toUpperCase());
  // Board grade from the spec sheet ("32-ECT single-wall"), right after the product and size.
  const board=/(\d+)-ECT\s+(single|double|triple)-wall/i.exec(body);
  if(board&&!/ECT/i.test(description)){const [head,...rest]=description.split(', ');description=[head,`${board[1]} ECT ${board[2].toLowerCase()} wall`,...rest].join(', ');}
  return description.replace(/\s+/g,' ').trim();
}

/** Pack and case qty from the spec sheet. Boxes priced per box are sold by the bundle: a smaller qty is a broken bundle. */
function packOf(product:Product,variant:Variant,body:string,price:number):{pack:string;caseQty:number}{
  const per=/([\d,]+)\s*(?:pcs?\.?\s*|pieces\s*|rolls?\s*|units?\s*|sheets?\s*|labels?\s*|bags?\s*)?(?:per|\/)\s*(case|bundle|roll|carton|box|pack|bale)\b/i.exec(body);
  const n=per?Number(per[1].replace(/,/g,'')):null;
  const unit=per?.[2].toLowerCase();
  const tiered=/\b(bundle|pallet)\b/i.test(variant.title);
  if(tiered||(unit==='bundle'&&price<15)){
    const bundle=unit==='bundle'&&n?n:price<5?25:price<20?10:1;
    return {pack:'Each',caseQty:bundle};
  }
  if(n&&unit)return {pack:`${unit==='roll'?'Roll':unit==='bundle'?'Bundle':'Case'} of ${n.toLocaleString('en-US')}`,caseQty:1};
  // No count on the page. Hand tape follows BOXT's hot melt listings (2 in: 36 a case, 3 in: 24);
  // hand stretch wrap is 4 rolls a case like the rest of the line; rolls, coils and tools sell singly.
  const title=product.title;
  if(/tape/i.test(title)&&/hand length/i.test(title)){const width=/(\d)"x/.exec(title)?.[1];if(width==='2'||width==='3')return {pack:`Case of ${width==='2'?36:24}`,caseQty:1};}
  if(/stretch wrap/i.test(title))return /hand length/i.test(title)?{pack:'Case of 4',caseQty:1}:{pack:'Roll',caseQty:1};
  if(/strapping/i.test(title))return {pack:'Coil',caseQty:1};
  if(/dispenser|cutter|knife|pallets?\b/i.test(title)&&!/cover|sheeting/i.test(title))return {pack:'Each',caseQty:1};
  if(/\brolls?\b|tubing|sheeting/i.test(title))return {pack:'Roll',caseQty:1};
  return {pack:'Case',caseQty:1};
}

async function main(){
  const products:Product[]=[];
  for(let page=1;;page++){
    const res=await fetch(`${SITE}/products.json?limit=250&page=${page}`);
    if(!res.ok)throw new Error(`products.json page ${page}: HTTP ${res.status}`);
    const batch=(await res.json() as {products:Product[]}).products;
    if(!batch.length)break;
    products.push(...batch);
  }
  const rows:BoxtRow[]=[];
  const seen=new Set<string>();
  for(const product of products){
    const category=CATEGORY[product.product_type];
    if(!category)throw new Error(`Unknown product_type "${product.product_type}" on ${product.handle}`);
    const body=text(product.body_html);
    // Colored and glamour mailers are tagged as poly mailers too; without that, "poly bubble mailers" means the standard ones.
    const tags=product.tags.map(t=>t.toLowerCase()).filter(t=>t!=='next-day'&&!(/colored|glamour/i.test(product.title)&&/\bpoly/.test(t)));
    // Stretch film with no color named is clear, so "clear stretch wrap" tells it from the colored rolls.
    if(category==='stretch-wrap'&&!COLORS.some(c=>new RegExp(`\\b${c}\\b`,'i').test(`${product.title} ${product.variants.map(v=>v.title).join(' ')} ${tags.join(' ')}`)))tags.push('clear');
    const keywords=(description:string)=>[...new Set(tags.filter(t=>!HUES.some(h=>{const hue=new RegExp(`\\b${h}\\b`,'i');return hue.test(t)&&!hue.test(description);})))].join(' ');
    for(const variant of product.variants){
      const sku=variant.sku?.trim();
      if(!sku||seen.has(sku))continue;
      seen.add(sku);
      const list=Number(variant.price);
      const description=describe(product,variant,body);
      rows.push({sku,description,category,...packOf(product,variant,body,list),list,keywords:keywords(description)});
    }
  }
  const order=Object.values(CATEGORY);
  rows.sort((a,b)=>order.indexOf(a.category)-order.indexOf(b.category));
  writeFileSync(OUT,`${JSON.stringify(rows,null,0).replace(/\},\{/g,'},\n{')}\n`);
  console.log(`Wrote ${rows.length} items from ${products.length} products to ${OUT}`);
}
void main();
