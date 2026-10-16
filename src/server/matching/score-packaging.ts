import {BURST_TO_ECT,DEFINING_CHOICE,PRODUCT_NOUNS,UNIT_TOLERANCE,familyOf,materialOfWord,parseItemSpec,parseSpec,productGroup,sameSize,type ChoiceKey,type DimOrder,type ItemSpec,type PackagingItem,type Size,type Spec} from './packaging';

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
//     is a contradiction. A negation is confirmed only when the item positively states something
//     else in its place (a flush-cut pouch confirms "no zipper"); otherwise ("BPA-free", "non-toxic",
//     "not printed") it is unconfirmed: the catalog never states what an item lacks;
//   - every value the line states is compared: "2 mil or 4 mil" against a 2 mil bag contradicts on 4;
//     a second size tuple must fit too; an ECT and a burst rating are each compared;
//   - a labelled size is put in the catalog's order for the item's category before comparing (bags
//     W x L, boxes L x W x H); a size outside the tuple is confirmed only by an item measure (never by
//     one of its dimensions), or, when labelled ("12\" deep"), by the dimension at that position;
//   - a stated pack count the item's pack doesn't give ("Case") is unconfirmed;
//   - a number the parser could not classify (a stray "10", "0.5" with no unit outside a tuple) is
//     unaccounted for, and is never confirmed by an equal dimension; a measure with a unit is only
//     compared with a catalog size that has a unit of the same kind, after conversion;
//   - OFF_NOUN (0.6) when the item's words don't include the product noun the line names (boxes,
//     bags, mailers, tape, ...). Whether the line names a product type the item confirms is reported
//     as `typeConfirmed`; retrieve() never clears a line without one (bare sizes);
//   - eligibility (B3b, Strict's total accounting): strictEligible only when the line has no blockers
//     of its own (packaging.ts), the item contradicts nothing, accounts for everything the line says,
//     the line for everything defining about the item, and the line's product noun is in the item's
//     DESCRIPTION (keywords don't count; NOUN_SYNONYMS lists the only stand-ins). `blockers` says why not;
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

export {PRODUCT_NOUNS};
/**
 * The only words a product family's keywords may confirm at Strict when the item's description
 * doesn't say them: plain synonyms and uses that say nothing about the item's spec (shipping,
 * packing, cardboard, plastic, carton sealing, packing list, corner protectors, ...), and product
 * nouns (a line must still name one the description says). Keywords also hold the family's claims
 * (eco, premium, reinforced, recyclable, custom, security, economy, export, ...), which Strict never
 * takes as confirmed. Balanced and Lenient take every keyword.
 */
export const KEYWORD_WORDS:ReadonlySet<string>=new Set(['shipping','packing','cardboard','plastic','poly','polypropylene','polyethylene','paperboard',
  'corrugated','industrial','carton','sealing','corner','list','wrapping','barcode']);
/**
 * The only line words that stand for an item's product noun besides the noun itself (Strict): bubble
 * or foam "wrap" is sold as "Bubble Rolls"/"Foam Rolls", stretch "film" as "Stretch Wrap", pallet top
 * "sheets" as "Top Sheeting", an RSC is a corrugated box, tissue paper is sold as "Tissue Paper
 * Sheets", and a strap is strapping. Nothing else: a carton is not a box, an envelope is not a mailer,
 * a pouch is not a bag, a gaylord is not its lid.
 */
export const NOUN_SYNONYMS:Readonly<Record<string,readonly string[]>>={roll:['wrap'],wrap:['film'],sheeting:['sheet'],box:['rsc'],sheet:['tissue'],strapping:['strap']};
/**
 * Item-side total accounting (Strict): every word of an item's description must be accounted for by
 * the line (or it is unstated: 0.75, and a blocker), except a material the line leaves unsaid and
 * these words, which every catalog item of their kind carries, so they never tell two items apart
 * (src/eval/eval.test.ts checks that against the catalog): "Cased" (all edge protectors),
 * "Perforated" (all bubble and foam rolls), "Central Folded" (all top sheeting), "Loose Fill" (all
 * peanuts), "Document" (all envelopes), "Hand" (all tape dispensers).
 */
export const NON_DEFINING_WORDS:ReadonlySet<string>=new Set(['cased','perforated','central','folded','loose','fill','document','hand']);
/** Line words that account for an item's description word besides the word itself: corner protectors are edge protectors. */
export const ITEM_WORD_SYNONYMS:Readonly<Record<string,readonly string[]>>={edge:['corner']};

/** Whether a line may be matched at Strict (total accounting), and if not, why: what the rep sees. */
export interface Eligibility {strictEligible:boolean;blockers:string[]}

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
  /** Strict's total accounting for this item (see the header). */
  eligibility:Eligibility;
}

const tuple=(dims:Size[])=>`${dims.map(d=>d.value).join('x')}${dims.at(-1)?.unit?` ${dims.at(-1)!.unit}`:''}`;
const strengthLabel=(s:Spec)=>s.ect!==null?`${s.ect} ECT`:`${s.burst} lb test`;
const packLabel=(n:number,key:'outer'|'roll')=>key==='roll'?`${n}/roll`:`${n}/pack`;

/**
 * The line's tuple in the item's order. Unlabelled: as given (positional). Fully labelled (the parser
 * put it in L, W, H/D order): as is for L x W x H items, W then L for width-first items. Null when the
 * labels can't be put in the item's order (partial or repeated labels, a height on a bag, an item
 * whose order is unknown).
 */
function tupleFor(line:Spec,order:DimOrder):Size[]|null{
  const dims=line.dims!,ranks=line.dimRanks;
  if(!ranks)return dims;
  if(ranks.some(r=>r===null)||new Set(ranks).size!==ranks.length)return null;
  const labels=ranks.join('');
  if(order==='lwh')return labels==='01'||labels==='012'?dims:null;
  if(order==='wl')return labels==='01'?[dims[1],dims[0]]:null;
  return null;
}
/** Where a labelled size outside the tuple sits among the item's dimensions, or null. */
function positionOf(rank:number,order:DimOrder,count:number){
  if(order==='lwh')return rank<count?rank:null;
  if(order==='wl')return rank===1?0:rank===0&&count>=2?1:null;
  return null;
}
const sameTuple=(a:Size[],b:Size[]|null)=>!!b&&a.length===b.length&&a.every((d,i)=>sameSize(d,b[i]));

/**
 * What the line's own words say about the material besides naming it (MATERIAL_IMPLIED_BY): an ECT,
 * a burst rating, a flute or a wall is a rating or construction of corrugated board only; a thickness
 * in mil, gauge or microns is a plastic film's (src/eval/eval.test.ts checks both against the catalog:
 * no item with them states another material).
 */
export const MATERIAL_IMPLIED_BY={corrugated:'an ECT, burst rating, flute or wall',poly:'a thickness in mil, gauge or microns'} as const;
function impliedMaterials(line:Spec){
  const materials=[...line.materials];
  if(line.values.ect.length||line.values.burst.length||line.choiceValues.flute||line.choiceValues.wall)materials.push('corrugated');
  if(line.values.mil.length||line.values.gauge.length)materials.push('poly');
  return materials;
}

/**
 * Defaults are implied only when no variant says otherwise (final fix round). The variants of an item
 * are the catalog items of the same product (head noun and description words) and the same size. Where
 * one of them states a different choice, colour or ECT (a double wall gaylord of the same size, a white
 * box of the same size, a coloured mailer of the same size), the item's own value is no longer a
 * default the line may leave unsaid: it must be stated, and an item that doesn't state its own value
 * (a "Colored Bubble Mailer" with no colour named) can't be confirmed at all.
 */
function variantDefaults(line:Spec,item:ScoredSpec,variants:readonly ScoredSpec[],already:ReadonlySet<string>){
  const out:string[]=[];
  // Only the variants the line still allows: one it contradicts (a blown wrap for a "cast" line, a 4 mil
  // bag for a "2 mil" line, a white box for a "kraft" line) doesn't make the item's default ambiguous.
  const allows=(v:ScoredSpec)=>
    (Object.entries(line.choiceValues) as [ChoiceKey,string[]][]).every(([key,values])=>v.choices[key]===undefined||values.includes(v.choices[key]!))&&
    line.colors.every(c=>!v.colors.length||v.colors.includes(c))&&
    line.values.mil.every(m=>v.mil===null||Math.abs(v.mil-m)<1e-9)&&line.values.gauge.every(g=>v.gauge===null||v.gauge===g)&&
    line.values.ect.every(e=>v.ect===null||v.ect===e)&&line.features.every(f=>v.features.includes(f));
  const others=variants.filter(v=>v!==item&&v.group!==item.group&&allows(v));
  if(!others.length)return out;
  const keys=new Set(others.flatMap(v=>Object.keys(v.choices) as ChoiceKey[]).concat(Object.keys(item.choices) as ChoiceKey[]));
  for(const key of keys){
    if(!others.some(v=>v.choices[key]!==item.choices[key]))continue;
    const value=item.choices[key];
    if(value===undefined)out.push(`${key}: not stated on this item, and its variants differ`);
    else if(line.choices[key]===undefined&&!already.has(`${key}: ${value}`))out.push(`${key}: ${value} (a variant of this item is ${others.map(v=>v.choices[key]??'unstated').filter(x=>x!==value).join('/')})`);
  }
  const colorsOf=(v:ScoredSpec)=>[...v.colors].sort().join('/');
  if(others.some(v=>colorsOf(v)!==colorsOf(item))){
    if(!item.colors.length)out.push('color: not stated on this item, and its variants differ');
    else if(!line.colors.length&&!already.has(`color: ${item.statedColors.join('/')}`))out.push(`color: ${item.colors.join('/')} (a variant of this item is another colour)`);
  }
  if(item.ect!==null&&others.some(v=>v.ect!==item.ect)&&!line.values.ect.length&&!line.values.burst.length&&!already.has(`strength: ${item.ect} ECT`))
    out.push(`strength: ${item.ect} ECT (a variant of this item is ${others.map(v=>v.ect===null?'unstated':`${v.ect} ECT`).filter(x=>x!==`${item.ect} ECT`).join('/')})`);
  return out;
}

/** How well an item fits a line, before rounding. */
function fit(line:Spec,item:ScoredSpec,variants:readonly ScoredSpec[]=[]){
  let total=0,got=0,distance=0,identity=false;
  const conflicts:string[]=[],unstated:string[]=[],unexplained:string[]=[],blockers:string[]=[];
  /** fit 1: the item confirms it; -1: the item contradicts it (label: why); 0: the item doesn't account for it (label: what). */
  const add=(weight:number,fit:1|0|-1,label:string)=>{
    if(fit===0){unexplained.push(label);return;}
    total+=weight;
    if(fit>0)got+=weight;else conflicts.push(label);
  };
  const A=PACKAGING_WEIGHTS.attribute;

  if(line.dims){
    const dims=item.dims;
    const mine=tupleFor(line,item.dimOrder);
    // An item with no size at all is not the sized item the line asks for.
    if(!dims)add(PACKAGING_WEIGHTS.dims,-1,`size: ${tuple(line.dims)} vs none`);
    else if(!mine){
      // Labels this item's order can't place: unconfirmed when some reading of them fits, else a contradiction.
      const readings=[line.dims,...(line.dimRanks?.join('')==='01'?[[line.dims[1],line.dims[0]]]:[])];
      if(readings.some(r=>sameTuple(r,dims)))add(PACKAGING_WEIGHTS.dims,0,`size: ${tuple(line.dims)}, labelled in an order this item's sizes are not listed in`);
      else add(PACKAGING_WEIGHTS.dims,-1,`size: ${tuple(line.dims)} vs ${tuple(dims)}`);
    }
    else if(sameTuple(mine,dims)||(!line.dimRanks&&sameTuple(mine,item.altDims))){add(PACKAGING_WEIGHTS.dims,1,'');identity=true;}
    else{
      add(PACKAGING_WEIGHTS.dims,-1,`size: ${tuple(mine)} vs ${tuple(dims)}`);
      // How far off the size is, to list the nearest sizes first among equal scores.
      distance=dims.length===mine.length?dims.reduce((sum,d,i)=>sum+Math.abs(Math.log((mine[i].value||1e-9)/(d.value||1e-9))),0):Infinity;
    }
    // A second tuple ("12x10x8 or 12x10x10") must fit as well: one item can't be both.
    for(const other of line.otherDims){
      add(PACKAGING_WEIGHTS.dims,sameTuple(other,dims)||sameTuple(other,item.altDims)?1:-1,`size: ${tuple(other)} vs ${dims?tuple(dims):'none'}`);
    }
  }
  // The line gives the item's full size, in the item's order.
  const sizeSaid=!!line.dims&&!!item.dims&&item.dims.length>=2&&familyOf(item.dims.at(-1)!.unit)==='length'&&
    ['ft','yd','m'].includes(item.dims.at(-1)!.unit??'')&&sameTuple(tupleFor(line,item.dimOrder)??[],item.dims);
  const used=new Set<Size>();
  // The tuple matched the item's dims with the size before them ("1/2\" Bubble 12\"x250'"): that size is said.
  if(line.dims&&item.altDims&&!line.dimRanks&&sameTuple(line.dims,item.altDims)){
    const bubble=item.measures.find(x=>sameSize(x,item.altDims![0]));
    if(bubble)used.add(bubble);
  }
  for(const m of line.measures){
    if(m.rank!==undefined){
      // "12\" deep": the dimension at that position, in the item's order.
      const at=item.dims?positionOf(m.rank,item.dimOrder,item.dims.length):null;
      if(at===null)add(A,0,`size: ${m.label}, labelled, with no such position on this item`);
      else add(A,sameSize(m,item.dims![at])?1:-1,`size: ${m.label} vs ${item.dims![at].label}`);
      continue;
    }
    // A size said as a thickness (".160\" thick", "1/4\" thick foam") is a thickness besides the item's
    // dimensions: an item with none (a 2" tape dispenser) has nothing it could be the thickness of.
    if(m.thickness&&!item.dims){add(A,0,`size: ${m.label} thick, and this item has no dimensions it is the thickness of`);continue;}
    // Only catalog sizes with a unit of the same kind: 0.5 cm is never the unitless "0.5". A loose
    // size is confirmed by one of the item's own measures (each confirms one), never by a dimension.
    const family=familyOf(m.unit);
    const own=item.measures.filter(x=>x.unit&&familyOf(x.unit)===family);
    const hit=own.find(x=>!used.has(x)&&sameSize(m,x));
    if(hit){used.add(hit);add(A,1,'');continue;}
    const dims=(item.dims??[]).filter(x=>x.unit&&familyOf(x.unit)===family);
    // With no tuple on the line, a lone length is the width of a width-first item (1/2" strapping,
    // 2" tape, 72 mm kraft tape): its first dimension. Never a box's, and never with a tuple present.
    if(!line.dims&&item.dimOrder==='wl'&&item.dims&&familyOf(item.dims[0].unit)===family&&item.dims[0].unit&&sameSize(m,item.dims[0])&&!used.has(item.dims[0])){
      used.add(item.dims[0]);add(A,1,'');continue;
    }
    if(dims.some(x=>sameSize(m,x)))add(A,0,`size: ${m.label} is one of the item's dimensions, not a size of its own`);
    else if(own.length||dims.length)add(A,-1,`size: ${m.label} vs ${[...own,...dims].map(x=>x.label).join(', ')}`);
    else add(A,0,`size: ${m.label}`);
  }

  for(const stray of line.strays)add(A,0,`number: ${stray.label}`);

  const {ect:ects,burst:bursts}=line.values;
  if(ects.length||bursts.length){
    if(item.ect===null&&item.burst===null)add(A,0,`strength: ${strengthLabel(line)}`);
    else{
      const itemEct=item.ect??BURST_TO_ECT[item.burst!];
      for(const e of ects)add(A,e===itemEct?1:-1,`strength: ${e} ECT vs ${strengthLabel(item)}`);
      for(const b of bursts)add(A,(item.burst!==null?b===item.burst:BURST_TO_ECT[b]===item.ect)?1:-1,`strength: ${b} lb test vs ${strengthLabel(item)}`);
    }
  }
  for(const [key,unit] of [['mil',' mil'],['gauge',' gauge'],['number','#'],['core',' core']] as const){
    const has=item[key];
    const label=(v:string|number)=>unit==='#'?`#${v}`:`${typeof v==='number'?Number(v.toFixed(2)):v}${unit}`;
    for(const said of line.values[key] as (string|number)[]){
      // Exact, except a mil converted from microns, which compares within UNIT_TOLERANCE.
      const tolerance=key==='mil'&&line.values.milFromMicron.some(m=>Math.abs(m-(said as number))<1e-12)?UNIT_TOLERANCE:0;
      const same=typeof said==='number'&&typeof has==='number'?Math.abs(said-has)<=Math.max(1e-9,tolerance*Math.max(said,has)):has===said;
      add(A,has===null?0:same?1:-1,has===null?`${key}: ${label(said)}`:`${key}: ${label(said)} vs ${label(has)}`);
    }
  }

  for(const color of line.colors){
    add(A,item.colors.includes(color)?1:item.colors.length?-1:0,item.colors.length?`color: ${color} vs ${item.colors.join('/')}`:`color: ${color}`);
  }
  if(!line.colors.length&&item.statedColors.length)unstated.push(`color: ${item.statedColors.join('/')}`);
  // The item's material, stated or implied by its own specs (a 48-ECT double wall sheet is corrugated).
  const itemMaterials=impliedMaterials(item);
  for(const material of line.materials){
    add(A,itemMaterials.includes(material)?1:itemMaterials.length?-1:0,itemMaterials.length?`material: ${material} vs ${itemMaterials.join('/')}`:`material: ${material}`);
  }
  for(const [key,values] of Object.entries(line.choiceValues) as [ChoiceKey,string[]][]){
    const has=item.choices[key];
    for(const value of values)add(A,has===undefined?0:has===value?1:-1,has===undefined?`${key}: ${value}`:`${key}: ${value} vs ${has}`);
  }
  for(const [key,value] of Object.entries(item.choices) as [ChoiceKey,string][]){
    if(line.choices[key]!==undefined||line.negated.choices[key]===value||!DEFINING_CHOICE(key,value))continue;
    // A BC or EB flute is double wall: a line that says double wall has said it.
    if(key==='flute'&&(value==='bc'||value==='eb')&&line.choices.wall==='double')continue;
    // A tape's or stretch wrap's "Hand Length"/"Machine Length" is its roll length: a line that gives the
    // item's full size, roll length included (2" x 110 yd), has said it. Strapping lists no hand length.
    if(key==='length'&&(item.head==='tape'||item.head==='wrap')&&sizeSaid)continue;
    unstated.push(`${key}: ${value}`);
  }
  for(const feature of line.features){
    const has=item.features.includes(feature);
    add(PACKAGING_WEIGHTS.feature,has?1:0,`feature: ${feature}`);
    identity||=has;
  }
  for(const feature of item.features)if(!line.features.includes(feature)&&!line.negated.features.includes(feature))unstated.push(`feature: ${feature}`);

  // What the line negates must not be there, and must be confirmed: the item has to state something
  // else in its place (another closure, another colour). The catalog never states what an item lacks,
  // so "BPA-free", "non-toxic" or "not printed" is unconfirmed even where the item doesn't say it.
  const {negated}=line;
  for(const [key,value] of Object.entries(negated.choices) as [ChoiceKey,string][]){
    if(item.choices[key]===value)conflicts.push(`not: ${key} ${value}`);
    else if(item.choices[key]===undefined)unexplained.push(`not: ${key} ${value}`);
  }
  for(const feature of negated.features){
    if(item.features.includes(feature))conflicts.push(`not: ${feature}`);
    else unexplained.push(`not: ${feature}`);
  }
  for(const color of negated.colors){
    if(item.colors.includes(color))conflicts.push(`not: ${color}`);
    else if(!item.colors.length)unexplained.push(`not: ${color}`);
  }
  for(const word of negated.words){
    if(item.wordSet.has(word))conflicts.push(`not: ${word}`);
    else unexplained.push(`not: ${word}`);
  }

  for(const key of ['outer','roll'] as const){
    const has=item.pack[key];
    for(const said of line.packValues[key]){
      // A stated count the item's pack doesn't give ("Case") is not confirmed.
      add(A,has===undefined?0:said===has?1:-1,has===undefined?`pack: ${packLabel(said,key)}, the item's count is not known`:`pack: ${packLabel(said,key)} vs ${packLabel(has,key)}`);
    }
  }

  // A line noun that stands for the item's head noun ("Foam Wrap" for Foam Rolls) is confirmed by it.
  const standsIn=(word:string)=>!!item.head&&(NOUN_SYNONYMS[item.head]??[]).includes(word);
  for(const word of line.words){
    const has=item.wordSet.has(word)||standsIn(word);
    add(PACKAGING_WEIGHTS.word,has?1:0,`word: ${word}`);
    identity||=has;
  }
  const named=line.words.filter(w=>PRODUCT_NOUNS.has(w));
  const typeConfirmed=named.some(w=>item.wordSet.has(w)||standsIn(w));
  const offNoun=named.length>0&&!typeConfirmed;
  // Item-side accounting of the item's specs (fix round 2): what the item states, the line must state.
  // Its full size; every size, weight or volume of its own (a .160" thickness, 40 lb paper, 600 lb
  // strapping, 14 cu ft); its mil, gauge, # and core; and its ECT, unless it is the standard 32 ECT
  // board every BOXT corrugated box is sold in. (The pack count is not a spec.)
  if(item.dims&&!line.dims)unstated.push(`size: ${tuple(item.dims)}`);
  for(const m of item.measures)if(m.unit&&!used.has(m))unstated.push(`size: ${m.label}`);
  for(const [key,unit] of [['mil',' mil'],['gauge',' gauge'],['number','#'],['core',' core']] as const){
    const has=item[key];
    if(has!==null&&!(line.values[key] as unknown[]).length)unstated.push(`${key}: ${unit==='#'?`#${has}`:`${has}${unit}`}`);
  }
  if(item.ect!==null&&item.ect!==32&&!line.values.ect.length&&!line.values.burst.length)unstated.push(`strength: ${item.ect} ECT`);
  // The material the item's description states is what kind it is (foam rolls, poly strapping, kraft or
  // poly bubble mailers, corrugated boxes): the line must state it, or say something only that
  // material has (MATERIAL_IMPLIED_BY).
  const lineMaterials=impliedMaterials(line);
  if(item.materials.length&&!item.materials.some(m=>lineMaterials.includes(m)))unstated.push(`material: ${item.materials.join('/')}`);
  unstated.push(...variantDefaults(line,item,variants,new Set(unstated)));
  // Strict: the line must name what the item is (its head noun, or a documented stand-in), and account
  // for every other word of the item's description: "Gaylord 48x40" is not the Gaylord Lid, "White
  // Paper" not White Flat Paper Mailers, "Expandable Foam Bags" not the Extra Thick (Bulk Pack) ones.
  const says=(noun:string)=>line.words.includes(noun)||(NOUN_SYNONYMS[noun]??[]).some(w=>line.words.includes(w));
  if(!named.length)blockers.push('the line names no product (box, bag, mailer, tape, ...)');
  if(!item.head)blockers.push(`product: the item's description names no product noun (${item.name})`);
  else if(!says(item.head))unstated.push(`product "${item.head}" (the item is "${item.name}"${named.length?`; the line names "${named.join('", "')}"`:''})`);
  for(const word of item.descWords){
    if(word===item.head||NON_DEFINING_WORDS.has(word)||says(word))continue;
    // A material word is charged once, above, as the item's material.
    if(materialOfWord(word))continue;
    // "Colors" (Cast Stretch Wrap, Machine Length, Colors ..., Blue) is said by the colour the line states.
    if(word==='color'&&line.colors.length)continue;
    if((ITEM_WORD_SYNONYMS[word]??[]).some(w=>line.words.includes(w)))continue;
    unstated.push(`word: ${word}`);
  }
  for(const word of line.words){
    if(!PRODUCT_NOUNS.has(word)&&!item.descSet.has(word)&&item.wordSet.has(word)&&!KEYWORD_WORDS.has(word))blockers.push(`only the product family's keywords say "${word}", not the item's description`);
  }

  const allConflicts=offNoun?[...conflicts,`noun: ${named.join('/')}`]:conflicts;
  // A pack quantity, mil or colour alone says nothing about what the item is: a word, a feature or the size must fit.
  if(!total||got<=0||!identity)return {score:0,conflicts:allConflicts,unstated,unexplained,typeConfirmed,distance,eligibility:NOT_A_CANDIDATE};
  const score=(got/total)*CONFLICT**conflicts.length*UNCONFIRMED**(unstated.length+unexplained.length)*(offNoun?OFF_NOUN:1);
  const eligibilityBlockers=[...line.blockers,...allConflicts.map(c=>`contradicts: ${c}`),...unstated.map(u=>`the line does not say ${u}`),
    ...unexplained.map(u=>`not confirmed by the item: ${u}`),...blockers];
  const eligibility:Eligibility={strictEligible:eligibilityBlockers.length===0,blockers:eligibilityBlockers};
  return {score,conflicts:allConflicts,unstated,unexplained,typeConfirmed,distance,eligibility};
}
/** The eligibility of an item that scores 0 (it never becomes a candidate). */
const NOT_A_CANDIDATE:Eligibility={strictEligible:false,blockers:['nothing in the line fits this item']};

type ScoredSpec=ItemSpec&{wordSet:ReadonlySet<string>;descSet:ReadonlySet<string>;group:string};
const ITEMS=new WeakMap<ItemSpec,ScoredSpec>();
/** The product and size an item is a variant of: head noun, description words (without NON_DEFINING_WORDS), features, dims and measures. */
function variantKey(spec:ScoredSpec){
  return JSON.stringify([spec.head,spec.descWords.filter(w=>!NON_DEFINING_WORDS.has(w)).sort(),[...spec.features].sort(),
    spec.dims?.map(d=>[d.unit,d.value])??null,spec.measures.filter(m=>m.unit).map(m=>[m.unit,m.value]).sort()]);
}

/**
 * A catalog row taken apart once, with its word sets and product group. Keyed on the parsed row,
 * which parseItemSpec caches per row object and parses again when the row's fields change, so a row
 * edited in place is never scored stale. Nothing about a line is cached: every call returns fresh
 * candidates.
 */
function itemOf(item:PackagingItem){
  const spec=parseItemSpec(item);
  let parsed=ITEMS.get(spec);
  if(!parsed){
    parsed={...spec,wordSet:new Set(spec.words),descSet:new Set(spec.descWords),group:productGroup(item)};
    ITEMS.set(spec,parsed);
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
  // Variants: items of one product (head noun and description words) and one size. Built per call from
  // the catalog given, so an edited catalog is never read stale.
  const specs=catalog.map(itemOf);
  const variants=new Map<string,ScoredSpec[]>();
  for(const spec of specs){
    const key=variantKey(spec);
    let list=variants.get(key);
    if(!list)variants.set(key,list=[]);
    list.push(spec);
  }
  catalog.forEach((item,index)=>{
    const spec=specs[index];
    // fit() scores 0 unless a word, a feature or the size fits; skip the rest cheaply (same result).
    // (A labelled tuple may be reordered for the item, so it is never skipped on size.)
    if(!line.words.some(w=>spec.wordSet.has(w))&&!line.features.some(f=>spec.features.includes(f))&&!line.dimRanks&&!sameDims(spec.dims)&&!sameDims(spec.altDims))return;
    const {score,conflicts,unstated,unexplained,typeConfirmed,distance,eligibility}=fit(line,spec,variants.get(variantKey(spec))??[]);
    const rounded=hundredths(score)/100;
    if(rounded>0)scored.push({item,score:rounded,group:spec.group,conflicts,unstated,unexplained,typeConfirmed,eligibility,index,distance});
  });
  return scored.sort((a,b)=>b.score-a.score||a.distance-b.distance||a.index-b.index).map(({index:_,distance:__,...c})=>c);
}

/** The variants of `spec` in a catalog (see scorePackaging), built per call so an edited catalog is never read stale. */
function variantsIn(catalog:readonly PackagingItem[],spec:ScoredSpec){
  const key=variantKey(spec);
  return catalog.map(itemOf).filter(other=>variantKey(other)===key);
}

/**
 * Strict's total accounting of `description` against ONE chosen item of `catalog` (the auto match, a
 * Swap or a "Use this item" pick): the eligibility scorePackaging gives that item, without scoring
 * the rest. The quote tool converts a customer's quantity only when this is strictEligible (B10b).
 */
export function accountLine<T extends PackagingItem>(description:string,item:T,catalog:readonly T[]):Eligibility{
  const spec=itemOf(item);
  return fit(parseSpec(description),spec,variantsIn(catalog,spec)).eligibility;
}
