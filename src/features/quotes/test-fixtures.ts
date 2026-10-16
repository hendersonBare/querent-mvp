import type {Quote,QuoteLine,QuoteSummary} from '@/server/repository/types';

// Quotes for the unit and component tests (no database).

export const QUOTE_ID='5d9a7c1e-2f43-4b8a-9c6d-0e1f2a3b4c5d';
export const EXAMPLE_ID='0b0e0000-0000-4000-8000-000000000001';
export const LINE_IDS=[
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
] as const;

const STAMP='2026-10-15T14:05:00.000Z';

export function line(over:Partial<QuoteLine>={}):QuoteLine{
  return {
    id:LINE_IDS[0],position:1,originalText:'500 - 12 x 10 x 8 single wall boxes',unmatched:false,sku:'12108-BDL',matchedBy:'auto',
    description:'12 x 10 x 8" Corrugated Boxes, bundle pricing',pack:'Bundle of 25',listPrice:1.12,quantity:1500,unit:'each',
    quantityUnclear:false,customerQuantity:null,unitPrice:1.05,matchScore:0.93,nearMisses:[],createdAt:STAMP,updatedAt:STAMP,...over,
  };
}

/** Three matched lines (one matched by the rep) and one unmatched line with near-misses. Total $1,775.98 (1,500 × 1.05 + 200 × 0.375 + 4 × 31.495 = 1,575 + 75 + 125.98). */
export function quote(over:Partial<Quote>={}):Quote{
  const lines=over.lines??[
    line(),
    line({id:LINE_IDS[1],position:2,sku:'M1044',description:'White Corrugated Mailers 10x4x4"',originalText:'200 white mailer boxes 10x4x4',quantity:200,unitPrice:0.375,matchScore:0.9}),
    line({id:LINE_IDS[2],position:3,sku:'B855SS',description:'#2 Kraft Bubble Mailers 8.5 x 12"',originalText:'4 cs #2 kraft bubble mailers 8.5 x 12',quantity:4,unit:'case',unitPrice:31.495,matchedBy:'rep',matchScore:0.71}),
    line({id:LINE_IDS[3],position:4,sku:null,matchedBy:null,unmatched:true,description:null,pack:null,listPrice:null,unitPrice:null,
      originalText:'250 boxes 12 x 10 x 8 double wall, 48 ECT',quantity:250,matchScore:0.58,nearMisses:[
        {sku:'12108-BDL',description:'12 x 10 x 8" Corrugated Boxes, bundle pricing',pack:'Bundle of 25',listPrice:1.12,score:0.58},
        {sku:'12108-PLT',description:'12 x 10 x 8" Corrugated Boxes, pallet pricing',pack:null,listPrice:null,score:0.57},
      ]}),
  ];
  return {
    id:QUOTE_ID,customerName:'Acme Fulfilment',reference:'PO-7781',isExample:false,matchStrictness:'strict',
    createdBy:'9f9f9f9f-0000-4000-8000-000000000009',createdByEmail:'rep@boxt.test',createdAt:STAMP,updatedAt:STAMP,
    lineCount:lines.length,unmatchedCount:lines.filter(l=>l.unmatched).length,total:1775.98,...over,lines,
  };
}

export function summary(over:Partial<QuoteSummary>={}):QuoteSummary{
  const {lines:_lines,...rest}=quote();
  return {...rest,...over};
}
