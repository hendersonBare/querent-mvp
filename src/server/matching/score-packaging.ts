import {DEFINING_CHOICE,familyOf,parseItemSpec,parseSpec,productGroup,sameSize,type ChoiceKey,type ItemSpec,type PackagingItem,type Size,type Spec} from './packaging';

// Packaging-aware scoring (BOXT task B3). Matching is by description only: a SKU typed in the line is
// just text, so a customer's own SKU can never match a BOXT SKU by coincidence. Pure; the catalog is
// an argument.
//
// The score is a product of factors, so each reason it is below 1 can be named (Candidate lists them):
//   - CONFLICT (0.5) per contradiction: the line says one thing and the item another. 12x8x10 for a
//     12x10x8 box, 44 ECT for 32 ECT, 4 mil for 2 mil, 500/case for a case of 1,000, white for kraft,
//     poly for a kraft (paper) mailer, open top for reclosable, newsprint for kraft paper, new for
//     recycled. An item with any contradiction scores at most 0.5, under every level, but stays on
//     the list as a near-miss;
//   - UNCONFIRMED (0.75) per thing on either side that the other doesn't account for. The rule is
//     symmetric:
//       * line -> item: every word, feature (heavy duty, insulated, anti-static, ...) and attribute
//         (a colour, mil, closure, measure, rating, ...) the line states must be confirmed by the
//         item's description or keywords. "Telescoping", "printed" or a word never seen before costs
//         the same as "heavy duty". Only the noise words in packaging.ts (STOP) are exempt, and a pack
//         quantity the item doesn't state ("Case") is no evidence either way;
//       * item -> line: each defining thing the item has and the line doesn't mention: a closure
//         (reclosable), a double or triple wall, a used or recycled condition, a feature (heavy duty,
//         bubble, insulated, warning print, ...), a paper grade, or a colour the description states
//         (implied colours, such as kraft for plain corrugated, are not charged);
//     So one unaccounted thing puts any item at 0.75 or below, and two at 0.56;
//   - a negation the item breaks ("no zipper" for a reclosable bag, "no bubble" for a bubble mailer)
//     is a contradiction; a negation the item keeps adds nothing;
//   - a number the parser could not classify (a stray "10", "0.5" with no unit outside a tuple) is
//     unaccounted for, and is never confirmed by an equal dimension; a measure with a unit is only
//     compared with a catalog size that has a unit of the same kind, after conversion;
//   - OFF_NOUN (0.6) when the item's words don't include the product noun the line names (boxes,
//     bags, mailers, tape, ...). Whether the line names a product type the item confirms is reported
//     as `typeConfirmed`; retrieve() never clears a line without one (bare sizes);
//   - among contradictions, the share of the line's weighted attributes the item confirms (the dims
//     tuple 3, an attribute 2, a feature or word 1), so near-misses rank by how much else fits.
// An item scores 0 unless a word, a feature or the size fits (a matching pack or colour alone says
// nothing about what the item is). A burst rating compares with ECT through the standard
// equivalents (200 lb test = 32 ECT, 275 = 44, 350 = 55); any other burst rating contradicts an ECT.

/** n in hundredths, without float noise: 0.95 - 0.8 is 15, not 14.999... Scores and leads compare in hundredths. */
export const hundredths=(n:number)=>Math.round(Number((n*100).toPrecision(12)));

/** What each thing the line says is worth. */
const PACKAGING_WEIGHTS={dims:3,attribute:2,feature:1,word:1} as const;
/** The factor per contradiction. */
export const CONFLICT=0.5;
/** The factor per thing one side states and the other doesn't account for (see above). */
export const UNCONFIRMED=0.75;
/** The factor for an item whose words don't include the product noun the line names. */
const OFF_NOUN=0.6;
/** Burst (Mullen) ratings and the ECT they are sold as equivalent to. */
const BURST_TO_ECT:Readonly<Record<number,number>>={200:32,275:44,350:55};

/** The product nouns a line can name. */
export const PRODUCT_NOUNS:ReadonlySet<string>=new Set(['box','carton','mailer','bag','pouch','envelope','tape','label','wrap','film','roll','sheet','pad','tubing','cover',
  'strapping','strap','dispenser','protector','pallet','peanut','sheeting','gaylord','lid','cutter','knife','liner','tube','paper','tissue','newsprint',
  'pillow','cushion','bin','sleeve','container','crate','tote','racking']);

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
  /** What the line states that the item doesn't account for: "word: telescoping", "feature: heavy duty". */
  unexplained:string[];
  /** The line names a product type ("boxes", "bags", ...) and this item's words include it. */
  typeConfirmed:boolean;
}

const tuple=(dims:Size[])=>`${dims.map(d=>d.value).join('x')}${dims.at(-1)?.unit?` ${dims.at(-1)!.unit}`:''}`;
const strengthLabel=(s:Spec)=>s.ect!==null?`${s.ect} ECT`:`${s.burst} lb test`;
const packLabel=(n:number,key:'outer'|'roll')=>key==='roll'?`${n}/roll`:`${n}/pack`;

/** How well an item fits a line, before rounding. */
function fit(line:Spec,item:ScoredSpec){
  let total=0,got=0,distance=0,identity=false;
  const conflicts:string[]=[],unstated:string[]=[],unexplained:string[]=[];
  /** fit 1: the item confirms it; -1: the item contradicts it (label: why); 0: the item doesn't account for it (label: what). */
  const add=(weight:number,fit:1|0|-1,label:string)=>{
    if(fit===0){unexplained.push(label);return;}
    total+=weight;
    if(fit>0)got+=weight;else conflicts.push(label);
  };
  const A=PACKAGING_WEIGHTS.attribute;

  if(line.dims){
    const dims=item.dims;
    const same=(tuple:Size[]|null)=>!!tuple&&tuple.length===line.dims!.length&&tuple.every((d,i)=>sameSize(line.dims![i],d));
    // An item with no size at all is not the sized item the line asks for.
    if(!dims)add(PACKAGING_WEIGHTS.dims,-1,`size: ${tuple(line.dims)} vs none`);
    else if(same(dims)||same(item.altDims)){add(PACKAGING_WEIGHTS.dims,1,'');identity=true;}
    else{
      add(PACKAGING_WEIGHTS.dims,-1,`size: ${tuple(line.dims)} vs ${tuple(dims)}`);
      // How far off the size is, to list the nearest sizes first among equal scores.
      distance=dims.length===line.dims.length?dims.reduce((sum,d,i)=>sum+Math.abs(Math.log((line.dims![i].value||1e-9)/(d.value||1e-9))),0):Infinity;
    }
  }
  for(const m of line.measures){
    // Only catalog sizes with a unit of the same kind: 0.5 cm is never the unitless "0.5".
    const comparable=[...(item.dims??[]),...item.measures].filter(x=>x.unit&&familyOf(x.unit)===familyOf(m.unit));
    if(comparable.some(x=>sameSize(m,x)))add(A,1,'');
    else if(comparable.length)add(A,-1,`size: ${m.label} vs ${comparable.map(x=>x.label).join(', ')}`);
    else add(A,0,`size: ${m.label}`);
  }

  for(const stray of line.strays)add(A,0,`number: ${stray.label}`);

  if(line.ect!==null||line.burst!==null){
    if(item.ect===null&&item.burst===null)add(A,0,`strength: ${strengthLabel(line)}`);
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
    add(A,has===null?0:has===said?1:-1,has===null?`${key}: ${label(said)}`:`${key}: ${label(said)} vs ${label(has)}`);
  }

  for(const color of line.colors){
    add(A,item.colors.includes(color)?1:item.colors.length?-1:0,item.colors.length?`color: ${color} vs ${item.colors.join('/')}`:`color: ${color}`);
  }
  if(!line.colors.length&&item.statedColors.length)unstated.push(`color: ${item.statedColors.join('/')}`);
  for(const material of line.materials){
    add(A,item.materials.includes(material)?1:item.materials.length?-1:0,item.materials.length?`material: ${material} vs ${item.materials.join('/')}`:`material: ${material}`);
  }
  for(const [key,value] of Object.entries(line.choices) as [ChoiceKey,string][]){
    const has=item.choices[key];
    add(A,has===undefined?0:has===value?1:-1,has===undefined?`${key}: ${value}`:`${key}: ${value} vs ${has}`);
  }
  for(const [key,value] of Object.entries(item.choices) as [ChoiceKey,string][]){
    if(line.choices[key]===undefined&&line.negated.choices[key]!==value&&DEFINING_CHOICE(key,value))unstated.push(`${key}: ${value}`);
  }
  for(const feature of line.features){
    const has=item.features.includes(feature);
    add(PACKAGING_WEIGHTS.feature,has?1:0,`feature: ${feature}`);
    identity||=has;
  }
  for(const feature of item.features)if(!line.features.includes(feature)&&!line.negated.features.includes(feature))unstated.push(`feature: ${feature}`);

  // What the line negates must not be there.
  const {negated}=line;
  for(const [key,value] of Object.entries(negated.choices) as [ChoiceKey,string][])if(item.choices[key]===value)conflicts.push(`not: ${key} ${value}`);
  for(const feature of negated.features)if(item.features.includes(feature))conflicts.push(`not: ${feature}`);
  for(const color of negated.colors)if(item.colors.includes(color))conflicts.push(`not: ${color}`);
  for(const word of negated.words)if(item.wordSet.has(word))conflicts.push(`not: ${word}`);

  for(const key of ['outer','roll'] as const){
    const said=line.pack[key],has=item.pack[key];
    if(said===undefined||has===undefined)continue;
    add(A,said===has?1:-1,`pack: ${packLabel(said,key)} vs ${packLabel(has,key)}`);
  }

  for(const word of line.words){
    const has=item.wordSet.has(word);
    add(PACKAGING_WEIGHTS.word,has?1:0,`word: ${word}`);
    identity||=has;
  }
  const named=line.words.filter(w=>PRODUCT_NOUNS.has(w));
  const typeConfirmed=named.some(w=>item.wordSet.has(w));
  const offNoun=named.length>0&&!typeConfirmed;

  // A pack quantity, mil or colour alone says nothing about what the item is: a word, a feature or the size must fit.
  if(!total||got<=0||!identity)return {score:0,conflicts,unstated,unexplained,typeConfirmed,distance};
  const score=(got/total)*CONFLICT**conflicts.length*UNCONFIRMED**(unstated.length+unexplained.length)*(offNoun?OFF_NOUN:1);
  return {score,conflicts:offNoun?[...conflicts,`noun: ${named.join('/')}`]:conflicts,unstated,unexplained,typeConfirmed,distance};
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
  const sameDims=(tuple:Size[]|null)=>!!line.dims&&!!tuple&&tuple.length===line.dims.length&&tuple.every((d,i)=>sameSize(line.dims![i],d));
  const scored:(Candidate<T>&{index:number;distance:number})[]=[];
  catalog.forEach((item,index)=>{
    const spec=itemOf(item);
    // fit() scores 0 unless a word, a feature or the size fits; skip the rest cheaply (same result).
    if(!line.words.some(w=>spec.wordSet.has(w))&&!line.features.some(f=>spec.features.includes(f))&&!sameDims(spec.dims)&&!sameDims(spec.altDims))return;
    const {score,conflicts,unstated,unexplained,typeConfirmed,distance}=fit(line,spec);
    const rounded=hundredths(score)/100;
    if(rounded>0)scored.push({item,score:rounded,group:spec.group,conflicts,unstated,unexplained,typeConfirmed,index,distance});
  });
  return scored.sort((a,b)=>b.score-a.score||a.distance-b.distance||a.index-b.index).map(({index:_,distance:__,...c})=>c);
}
