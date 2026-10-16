import type {CatalogItem} from '@/server/repository/types';
import type {Judge,JudgeCandidate,JudgeVerdict,ParsedRow,Parser} from '@/server/llm/types';
import type {MatchRun,ResultLine} from './types';
import {pricingUnit} from './units';

// Test helpers for the quote tool: a small catalog the real scorer clears some lines against, fake
// parsers and judges, and result lines for the dialog tests. Not imported by app code.

const item=(sku:string,description:string,pack:string|null,caseQty:number|null,listPrice:number|null,category:string):CatalogItem=>
  ({sku,description,pack,caseQty,listPrice,category,keywords:''});

/** With the Strict rule: the first three lines below clear; the rest do not. */
export const CATALOG:CatalogItem[]=[
  item('12108-BDL','12x10x8" Corrugated Boxes, 32 ECT, bundle pricing','Each',25,0.84,'Boxes'),
  item('12108-PLT','12x10x8" Corrugated Boxes, 32 ECT, pallet pricing','Each',25,0.71,'Boxes'),
  item('161212-BDL','16x12x12" Corrugated Boxes, 32 ECT, bundle pricing','Each',25,1.52,'Boxes'),
  item('SF188CAST','Cast Stretch Wrap 18"x1500\' 80 Gauge','Case of 4',4,24.5,'Stretch Film'),
  item('PB3669','Reclosable Poly Bags 30x30" 2 Mil','Case of 250',250,89,'Poly Bags'),
  item('PB3670','Reclosable Poly Bags 30x30" 4 Mil','Case of 100',100,99,'Poly Bags'),
  // Two rows the TIE line fully names, worded apart (two product groups with the same score): a genuine tie.
  item('T902','Clear Hot Melt Tape 2" x 110 yd','Case of 36',1,60,'Tape'),
  item('T902B','Clear Hot Melt Tape, 2" x 110 yd','Case of 36',1,60,'Tape'),
];

export const STRICT={minScore:0.9,minLead:0.35};

/** Lines that clear Strict against CATALOG (top SKUs 12108-BDL, SF188CAST, PB3669). */
export const CLEAR_BOX='12x10x8" Corrugated Boxes, 32 ECT';
export const CLEAR_WRAP='Cast Stretch Wrap 18"x1500\' 80 Gauge';
export const CLEAR_BAGS='Reclosable Poly Bags 30x30" 2 Mil';
/** Lines that do not: nothing scores; a tie between two groups (both fully accounted for, equal scores); a wrong-order box. */
export const NOTHING='Foam peanuts 14 cu ft';
export const TIE='Clear Hot Melt Tape 2" x 110 yd';
export const WRONG_BOX='12x8x10" Corrugated Boxes';

export function row(description:string,overrides:Partial<ParsedRow>={}):ParsedRow{
  return {rawText:`${description} 10 cs`,description,quantity:10,unit:'case',suppliersSku:null,quantityUnclear:false,...overrides};
}

export function fakeParser(rows:ParsedRow[]|{error:string}):Parser&{calls:number}{
  const parser={
    calls:0,
    async parse(){
      parser.calls++;
      return Array.isArray(rows)?{ok:true as const,rows}:{ok:false as const,error:rows.error};
    },
  };
  return parser;
}

export interface JudgeCall {description:string;candidates:JudgeCandidate[]}

/** A judge that answers `answer(line, candidates)` (default: the first candidate) and records each call. */
export function fakeJudge(answer:(description:string,candidates:JudgeCandidate[])=>JudgeVerdict|Promise<JudgeVerdict>=(_,c)=>({sku:c[0]?.sku??null,reason:'first'})):Judge&{calls:JudgeCall[]}{
  const calls:JudgeCall[]=[];
  return {
    calls,
    async judge(line,candidates){
      calls.push({description:line.description,candidates});
      return answer(line.description,candidates);
    },
  };
}

// ---- Result lines for the dialog ------------------------------------------------------------------

const BOX={sku:'12108-BDL',description:'12x10x8" Corrugated Boxes, 32 ECT, bundle pricing',pack:'Bundle of 25',category:'Boxes',listPrice:0.84,listPriceUnit:'each',pricing:pricingUnit('Each',25)};
const BOX_PLT={sku:'12108-PLT',description:'12x10x8" Corrugated Boxes, 32 ECT, pallet pricing',pack:'Bundle of 25',category:'Boxes',listPrice:0.71,listPriceUnit:'each',pricing:pricingUnit('Each',25)};
const WRAP={sku:'SF188CAST',description:'Cast Stretch Wrap 18"x1500\' 80 Gauge',pack:'Case of 4',category:'Stretch Film',listPrice:24.5,listPriceUnit:'case',pricing:pricingUnit('Case of 4',1)};
const BAGS={sku:'PB3669',description:'Reclosable Poly Bags 30x30" 2 Mil',pack:'Case of 250',category:'Poly Bags',listPrice:89,listPriceUnit:'case',pricing:pricingUnit('Case of 250',1)};
const BAGS4={sku:'PB3670',description:'Reclosable Poly Bags 30x30" 4 Mil',pack:'Case of 100',category:'Poly Bags',listPrice:99,listPriceUnit:'case',pricing:pricingUnit('Case of 100',1)};

export function resultLine(overrides:Partial<ResultLine>&Pick<ResultLine,'index'>):ResultLine{
  return {
    rawText:'line',description:'line',quantity:1,unit:null,quantityUnclear:false,outcome:'no_match',reason:'below_threshold',
    score:0,candidates:[],nearMisses:[],...overrides,
  };
}

/** Two matched lines (one with an unclear quantity) and two unmatched lines (one with near-misses). */
export function sampleRun():MatchRun{
  const lines:ResultLine[]=[
    resultLine({index:0,rawText:'S-4128 12 x 10 x 8" Corrugated Boxes 10 bundles',description:'12 x 10 x 8" Corrugated Boxes',quantity:10,unit:'bundle',
      outcome:'matched',reason:'matched',item:BOX,score:1,candidates:[{...BOX,score:1},{...BOX_PLT,score:1}],nearMisses:[{...BOX,score:1}]}),
    resultLine({index:1,rawText:'Cast Stretch Wrap 18" x 1500\' 80 ga as needed',description:'Cast Stretch Wrap 18" x 1500\' 80 ga',quantity:null,quantityUnclear:true,
      outcome:'matched',reason:'matched',item:WRAP,score:0.95,candidates:[{...WRAP,score:0.95}],nearMisses:[{...WRAP,score:0.95}]}),
    resultLine({index:2,rawText:'Reclosable bags 30x30 3 mil 4 cases',description:'Reclosable bags 30x30 3 mil',quantity:4,unit:'case',
      outcome:'no_match',reason:'low_lead',score:0.56,candidates:[{...BAGS,score:0.56},{...BAGS4,score:0.42}],nearMisses:[{...BAGS,score:0.56},{...BAGS4,score:0.42}]}),
    resultLine({index:3,rawText:'Foam peanuts 14 cu ft 2 bags',description:'Foam peanuts 14 cu ft',quantity:2,unit:'bag',outcome:'no_match',reason:'no_candidates'}),
  ];
  return {level:'strict',lines,counts:{rows:4,matched:2,unmatched:2,judged:2}};
}
