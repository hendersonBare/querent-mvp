import {DEFINING_CHOICE,familyOf,parseItemSpec,parseSpec,productGroup,sameSize,type ChoiceKey,type ItemSpec,type PackagingItem,type Size,type Spec} from './packaging';
import {OFF_NOUN,hundredths} from './score';

// Packaging-aware scoring (BOXT task B3). Matching is by description only: a SKU typed in the line is
// just text, so a customer's own SKU can never match a BOXT SKU by coincidence. Pure; the catalog is
// an argument.
//
// score = how much of what the line says the item confirms (0 to 1), then scaled down:
//   - the dims tuple weighs 3; every typed attribute (a measure, ECT or burst rating, mil, gauge,
//     "#2", colour, material, wall, closure, adhesive, print, film, hand/machine, pack quantity)
//     weighs 2; a feature (bubble, padded, ...) and each word weigh 1;
//   - an attribute the item contradicts earns nothing AND multiplies the score by CONFLICT, once
//     per contradiction: 12x8x10 for a 12x10x8 box, 44 ECT for 32 ECT, 4 mil for 2 mil, 500/case
//     for a case of 1,000, white for kraft, poly for a kraft (paper) mailer, open top for
//     reclosable, newsprint for kraft paper. So an item with any contradiction scores at most
//     CONFLICT (0.5), under every level's minScore, yet stays on the list as a near-miss;
//   - an attribute the item doesn't state adds nothing (unconfirmed, not contradicted);
//   - a pack quantity the item doesn't state ("Case") is left out entirely: no evidence either way;
//   - a burst rating compares with ECT through the standard equivalents (200 lb test = 32 ECT,
//     275 = 44, 350 = 55); any other burst rating contradicts an ECT;
//   - each defining thing the item has and the line doesn't say multiplies by UNSTATED: a closure
//     (reclosable), a double or triple wall, a feature (heavy duty, bubble, insulated, warning
//     print, ...) or a colour the description states (white boxes for a line that names no colour;
//     implied colours, such as kraft for plain corrugated, are not charged);
//   - an item scores 0 unless a word, a feature or the size fits (a matching pack quantity or
//     colour alone says nothing about what the item is);
//   - an item whose words don't include the product noun the line names (boxes, bags, mailers,
//     tape, ...) is scaled by OFF_NOUN.

/** What each thing the line says is worth. */
export const PACKAGING_WEIGHTS={dims:3,attribute:2,feature:1,word:1} as const;
/** The factor per contradiction. */
export const CONFLICT=0.5;
/** The factor per defining item feature (closure, wall, kind, stated colour) the line doesn't state. */
export const UNSTATED=0.8;
/** Burst (Mullen) ratings and the ECT they are sold as equivalent to. */
export const BURST_TO_ECT:Readonly<Record<number,number>>={200:32,275:44,350:55};

/** The product nouns a line can name. */
const NOUNS=new Set(['box','carton','mailer','bag','pouch','envelope','tape','label','wrap','film','roll','sheet','pad','tubing','cover',
  'strapping','strap','dispenser','protector','pallet','peanut','sheeting','gaylord','lid','cutter','knife','liner','tube']);

/** A scored catalog item, with what lowered its score. */
export interface Candidate<T> {
  item:T;
  /** 0 to 1, in hundredths. */
  score:number;
  /** The product group (pricing tiers of one item share it). */
  group:string;
  /** The line's attributes the item contradicts: "size: 12x8x10 in vs 12x10x8 in". */
  conflicts:string[];
  /** The item's defining features the line doesn't state: "closure: reclosable". */
  unstated:string[];
}

const tuple=(dims:Size[])=>`${dims.map(d=>d.value).join('x')}${dims.at(-1)?.unit?` ${dims.at(-1)!.unit}`:''}`;
const strengthLabel=(s:Spec)=>s.ect!==null?`${s.ect} ECT`:`${s.burst} lb test`;
const packLabel=(n:number,key:'outer'|'roll')=>key==='roll'?`${n}/roll`:`${n}/pack`;

/** How well an item fits a line, before rounding. */
function fit(line:Spec,item:ScoredSpec){
  let total=0,got=0,distance=0,identity=false;
  const conflicts:string[]=[],unstated:string[]=[];
  const add=(weight:number,fit:1|0|-1,conflict?:string)=>{
    total+=weight;got+=weight*Math.max(fit,0);
    if(fit<0&&conflict)conflicts.push(conflict);
  };
  const A=PACKAGING_WEIGHTS.attribute;

  if(line.dims){
    const dims=item.dims;
    const same=(tuple:Size[]|null)=>!!tuple&&tuple.length===line.dims!.length&&tuple.every((d,i)=>sameSize(line.dims![i],d));
    if(!dims)add(PACKAGING_WEIGHTS.dims,0);
    else if(same(dims)||same(item.altDims)){add(PACKAGING_WEIGHTS.dims,1);identity=true;}
    else{
      add(PACKAGING_WEIGHTS.dims,-1,`size: ${tuple(line.dims)} vs ${tuple(dims)}`);
      // How far off the size is, to list the nearest sizes first among equal scores.
      distance=dims.length===line.dims.length?dims.reduce((sum,d,i)=>sum+Math.abs(Math.log((line.dims![i].value||1e-9)/(d.value||1e-9))),0):Infinity;
    }
  }
  for(const m of line.measures){
    const comparable=[...(item.dims??[]),...item.measures].filter(x=>!m.unit||!x.unit||familyOf(x.unit)===familyOf(m.unit));
    if(comparable.some(x=>sameSize(m,x)))add(A,1);
    else if(comparable.length)add(A,-1,`size: ${m.label} vs ${comparable.map(x=>x.label).join(', ')}`);
    else add(A,0);
  }

  if(line.ect!==null||line.burst!==null){
    if(item.ect===null&&item.burst===null)add(A,0);
    else{
      const same=line.burst!==null&&item.burst!==null?line.burst===item.burst
        :(line.ect??BURST_TO_ECT[line.burst!])===(item.ect??BURST_TO_ECT[item.burst!]);
      add(A,same?1:-1,`strength: ${strengthLabel(line)} vs ${strengthLabel(item)}`);
    }
  }
  for(const [key,unit] of [['mil',' mil'],['gauge',' gauge'],['number','#']] as const){
    const said=line[key];
    if(said===null)continue;
    const has=item[key];
    const label=(v:string|number)=>unit==='#'?`#${v}`:`${v}${unit}`;
    add(A,has===null?0:has===said?1:-1,has===null?undefined:`${key}: ${label(said)} vs ${label(has)}`);
  }

  for(const color of line.colors){
    add(A,item.colors.includes(color)?1:item.colors.length?-1:0,`color: ${color} vs ${item.colors.join('/')}`);
  }
  if(!line.colors.length&&item.statedColors.length)unstated.push(`color: ${item.statedColors.join('/')}`);
  for(const material of line.materials){
    add(A,item.materials.includes(material)?1:item.materials.length?-1:0,`material: ${material} vs ${item.materials.join('/')}`);
  }
  for(const [key,value] of Object.entries(line.choices) as [ChoiceKey,string][]){
    const has=item.choices[key];
    add(A,has===undefined?0:has===value?1:-1,`${key}: ${value} vs ${has}`);
  }
  for(const [key,value] of Object.entries(item.choices) as [ChoiceKey,string][]){
    if(line.choices[key]===undefined&&DEFINING_CHOICE(key,value))unstated.push(`${key}: ${value}`);
  }
  for(const feature of line.features){
    const has=item.features.includes(feature);
    add(PACKAGING_WEIGHTS.feature,has?1:0);
    identity||=has;
  }
  for(const feature of item.features)if(!line.features.includes(feature))unstated.push(`feature: ${feature}`);

  for(const key of ['outer','roll'] as const){
    const said=line.pack[key],has=item.pack[key];
    if(said===undefined||has===undefined)continue;
    add(A,said===has?1:-1,`pack: ${packLabel(said,key)} vs ${packLabel(has,key)}`);
  }

  for(const word of line.words){
    const has=item.wordSet.has(word);
    add(PACKAGING_WEIGHTS.word,has?1:0);
    identity||=has;
  }
  const named=line.words.filter(w=>NOUNS.has(w));
  const offNoun=named.length>0&&!named.some(w=>item.wordSet.has(w));

  // A pack quantity, mil or colour alone says nothing about what the item is: a word, a feature or the size must fit.
  if(!total||got<=0||!identity)return {score:0,conflicts,unstated,distance};
  const score=(got/total)*CONFLICT**conflicts.length*UNSTATED**unstated.length*(offNoun?OFF_NOUN:1);
  return {score,conflicts:offNoun?[...conflicts,`noun: ${named.join('/')}`]:conflicts,unstated,distance};
}

type ScoredSpec=ItemSpec&{wordSet:ReadonlySet<string>;group:string};
const ITEMS=new WeakMap<object,ScoredSpec>();
/** A catalog row taken apart once (per row object), with its word set and product group. */
function itemOf(item:PackagingItem){
  let parsed=ITEMS.get(item);
  if(!parsed){
    const spec=parseItemSpec(item);
    parsed={...spec,wordSet:new Set(spec.words),group:productGroup(item)};
    ITEMS.set(item,parsed);
  }
  return parsed;
}

/**
 * Every catalog item that fits `description` at all, best first, scored 0 to 1 in hundredths. Among
 * equal scores the nearer size comes first, then catalog order (so a bundle-pricing tier comes
 * before its pallet-pricing twin).
 */
export function scorePackaging<T extends PackagingItem>(description:string,catalog:readonly T[]):Candidate<T>[]{
  const line=parseSpec(description);
  const scored:(Candidate<T>&{index:number;distance:number})[]=[];
  catalog.forEach((item,index)=>{
    const spec=itemOf(item);
    const {score,conflicts,unstated,distance}=fit(line,spec);
    const rounded=hundredths(score)/100;
    if(rounded>0)scored.push({item,score:rounded,group:spec.group,conflicts,unstated,index,distance});
  });
  return scored.sort((a,b)=>b.score-a.score||a.distance-b.distance||a.index-b.index).map(({index:_,distance:__,...c})=>c);
}
