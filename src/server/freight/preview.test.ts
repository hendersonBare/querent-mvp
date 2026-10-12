import {describe,expect,it} from 'vitest';
import {impactPreview,type PreviewLine} from './preview';

// The impact preview (v3 spec §4.7, decision 35; test plan §12 "Impact preview"): over delivery
// quotes from the last 90 days that would carry recovery, how many there are, and per product
// category the average line price change at the step-1 rate and at the full rate. Pure.

const FASTENERS={categoryId:'fasteners',categoryName:'Fasteners',categoryOrder:1};
const TOOLS={categoryId:'power-tools',categoryName:'Power tools',categoryOrder:4};
const line=(cat:typeof FASTENERS,line_no:number,qty:number,unitPriceCents:number|null,unitCostCents:number,basis:PreviewLine['basis']='customer'):PreviewLine=>({...cat,line_no,qty,unitPriceCents,unitCostCents,basis});

// Decision log example: bolts $20 (cost $19) and a drill $180 (cost $150).
const A={carries:true,lines:[line(TOOLS,1,1,18000,15000),line(FASTENERS,2,1,2000,1900)]};
// Nuts 10 × $2.00 (cost $1.00), a contract line (exempt, 0%) and an unpriced line (left out).
const B={carries:true,lines:[line(FASTENERS,1,10,200,100),line(FASTENERS,2,5,300,200,'contract'),line(FASTENERS,3,4,null,100,null)]};
// Under the threshold, overridden or call for freight: carries nothing, so it is not affected.
const C={carries:false,lines:[line(FASTENERS,1,100,2000,1000)]};

describe('impactPreview',()=>{
  it('counts the quotes affected and averages each category’s line price change at the step-1 and full rates',()=>{
    expect(impactPreview({quotes:[A,B,C],step1Bp:167,fullBp:500,lineCapBp:800})).toEqual({
      deliveryQuotes:3,affected:2,step1Bp:167,fullBp:500,
      categories:[
        // Full: bolts +32¢ on $20 = 160 bp, nuts +10¢ on $2 = 500 bp, the contract line 0 → 220 bp.
        // Step 1: bolts +10¢ = 50 bp, nuts +3¢ = 150 bp, contract 0 → 66.7 → 67 bp.
        // In dollars (C_S7, plan U8): full (32¢ + 10¢ + 0) ÷ 3 = 14¢, step 1 (10¢ + 3¢ + 0) ÷ 3 = 4.3 → 4¢; in A and B.
        {categoryId:'fasteners',categoryName:'Fasteners',lines:3,step1ChangeBp:67,fullChangeBp:220,quotes:2,step1ChangeCents:4,fullChangeCents:14},
        // Full: +$9.68 on $180 = 537.8 → 538 bp. Step 1: +$3.24 = 180 bp.
        {categoryId:'power-tools',categoryName:'Power tools',lines:1,step1ChangeBp:180,fullChangeBp:538,quotes:1,step1ChangeCents:324,fullChangeCents:968},
      ],
    });
  });

  it('applies the per-line cap',()=>{
    // A $5.00 item (cost $1.00) alone at 1000 bp: target 50¢, capped at 8% = 40¢ → 800 bp.
    const only={carries:true,lines:[line(TOOLS,1,1,500,100)]};
    expect(impactPreview({quotes:[only],step1Bp:1000,fullBp:1000,lineCapBp:800}).categories).toEqual([{categoryId:'power-tools',categoryName:'Power tools',lines:1,step1ChangeBp:800,fullChangeBp:800,quotes:1,step1ChangeCents:40,fullChangeCents:40}]);
  });

  it('is empty when no quote would carry recovery, and at a 0 bp rate nothing changes',()=>{
    expect(impactPreview({quotes:[C],step1Bp:100,fullBp:300,lineCapBp:800})).toEqual({deliveryQuotes:1,affected:0,step1Bp:100,fullBp:300,categories:[]});
    expect(impactPreview({quotes:[],step1Bp:0,fullBp:0,lineCapBp:800})).toEqual({deliveryQuotes:0,affected:0,step1Bp:0,fullBp:0,categories:[]});
    expect(impactPreview({quotes:[A],step1Bp:0,fullBp:0,lineCapBp:800}).categories.map(c=>[c.step1ChangeBp,c.fullChangeBp])).toEqual([[0,0],[0,0]]);
  });
});
