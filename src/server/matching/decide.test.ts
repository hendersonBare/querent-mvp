import {describe,expect,it} from 'vitest';
import {decide} from './decide';
import type {Candidate,Retrieval} from './retrieve';

// decide() is the last step of the pipeline (and of the evaluation suite): a line is Matched only
// when the scorer clears the threshold and lead AND the judge picks an item of the top candidate's
// product group. Never on the judge alone, never on the scorer alone.

type Row={sku:string;description:string};
const candidate=(sku:string,score:number,group=sku):Candidate<Row>=>({item:{sku,description:sku},score,group,conflicts:[],unstated:[]});
const RULE={minScore:0.9,minLead:0.2};

function retrieval(candidates:Candidate<Row>[],{lead,clears}:{lead:number;clears:boolean}):Retrieval<Row>{
  return {candidates,top:candidates[0]??null,lead,clears,nearMisses:candidates,rule:RULE};
}

const BDL=candidate('12108-BDL',1,'box 12x10x8');
const PLT=candidate('12108-PLT',1,'box 12x10x8');
const OTHER=candidate('12106-BDL',0.4,'box 12x10x6');
const cleared=retrieval([BDL,PLT,OTHER],{lead:0.6,clears:true});

describe('decide',()=>{
  it('matches when the scorer clears and the judge picks the top candidate',()=>{
    expect(decide(cleared,{sku:'12108-BDL'})).toEqual({outcome:'matched',item:BDL.item,score:1});
  });

  it('matches the variant the judge picked when it is in the top candidate\'s product group',()=>{
    expect(decide(cleared,{sku:'12108-PLT'})).toEqual({outcome:'matched',item:PLT.item,score:1});
  });

  it('is no match when the judge says none',()=>{
    expect(decide(cleared,{sku:null})).toEqual({outcome:'no_match',reason:'judge_none'});
  });

  it('is no match when the judge picks another product group, or a SKU not on the list',()=>{
    expect(decide(cleared,{sku:'12106-BDL'})).toEqual({outcome:'no_match',reason:'judge_disagrees'});
    expect(decide(cleared,{sku:'NOT-LISTED'})).toEqual({outcome:'no_match',reason:'judge_disagrees'});
  });

  it('is no match below the threshold, whatever the judge says',()=>{
    const low=retrieval([candidate('A',0.8),candidate('B',0.1)],{lead:0.7,clears:false});
    expect(decide(low,{sku:'A'})).toEqual({outcome:'no_match',reason:'below_threshold'});
  });

  it('is no match on a small lead, whatever the judge says',()=>{
    const close=retrieval([candidate('A',1),candidate('B',0.9)],{lead:0.1,clears:false});
    expect(decide(close,{sku:'A'})).toEqual({outcome:'no_match',reason:'low_lead'});
  });

  it('is no match when there are no candidates',()=>{
    expect(decide(retrieval([],{lead:0,clears:false}),{sku:null})).toEqual({outcome:'no_match',reason:'no_candidates'});
    expect(decide(retrieval([],{lead:0,clears:false}),{sku:'A'})).toEqual({outcome:'no_match',reason:'no_candidates'});
  });
});
