import {describe,expect,it} from 'vitest';
import {quoteFigures} from '@/server/rep/quote-math';
import {ITEMS,SAMPLE_LINES,detailLine,sampleDetail} from '../test-fixtures';
import {quoteSummaryText,summaryQuoteOf,type SummaryQuote} from './summary';

// Copy quote summary (task 4.3, spec §4): plain text for an email or a text message, from the
// quote as it stands on screen. Customer-safe: what the customer PDF says, never cost, margin,
// floors, price basis or Querent's reasoning.

const figuresOf=(detail:ReturnType<typeof sampleDetail>)=>quoteFigures(detail.lines,{freight:detail.freight,rates:detail.delivery_rates,branchCode:detail.quote.branch_code,
  floor:{repId:detail.quote.rep_id,repName:detail.quote.rep_name,floors:detail.floors}});
const summaryOf=(detail=sampleDetail(),terms:string|null=null)=>quoteSummaryText(summaryQuoteOf(detail,detail.lines,figuresOf(detail),terms));

const SAMPLE_TEXT=[
  'Quote Q-24817 rev 1 (draft, not sent) for Wasatch Mechanical Contractors (Dana Ortiz)',
  'Valid until Oct 9, 2026 · Will call at SLC',
  '',
  '10 x HCS-12-13-2G8 Hex cap screw 1/2-13 x 2 in (Box of 50) @ $31.50 = $315.00',
  '6 x CW-45-045-T1 Cut-off wheel 4.5 x .045 x 7/8 in (Box of 25) @ $36.00 = $216.00',
  '4 x GLV-N8-L-1000 Nitrile disposable gloves (Case of 1,000) @ $79.00 = $316.00',
  '12 x RS-2-27-JH Ratchet strap 2 in x 27 ft @ $22.95 = $275.40',
  '',
  'Items $1,122.40 · Freight $0.00 · Total $1,122.40 before tax',
].join('\n');

describe('quoteSummaryText',()=>{
  it('says what the customer quote says, in the mockup\'s shape: who, valid until and fulfillment, one line per item, the totals',()=>{
    expect(summaryOf()).toBe(SAMPLE_TEXT);
  });

  it('has no cost, margin, floor, price basis or Querent\'s reasoning',()=>{
    const explained=sampleDetail({lines:SAMPLE_LINES.map(l=>({...l,explanation:'Last paid $31.50 on Aug 12, above customer price $30.95. +$5.50 GP vs customer price.'}))});
    const text=summaryOf(explained);
    for(const line of explained.lines){
      for(const value of [line.unit_cost,line.qty*line.unit_cost])expect(text).not.toContain(value.toFixed(2));
      expect(text).not.toContain(String(line.list_price.toFixed(2)));
    }
    // $361.40 GP and 32.2% margin on the summary card; Querent found +$11.50.
    for(const figure of ['361.40','32.2','11.50','21.40','24.10','58.00','14.20'])expect(text).not.toContain(figure);
    // (\bcontract\b: the customer is Wasatch Mechanical Contractors.)
    expect(text).not.toMatch(/cost|margin|floor|\bGP\b|%|basis|last paid|\blist\b|\bcontract\b|suggest|querent|why this price|internal/i);
  });

  it('numbers the revision a send would store on a draft, marked as a draft, and the sent one otherwise',()=>{
    // Changes requested: Dana holds rev 1, so rev 2 must not pass for a quote she was sent (cleanup 16).
    const revising=sampleDetail({quote:{status:'changes_requested',revision:1}});
    expect(summaryOf(revising).split('\n')[0]).toBe('Quote Q-24817 rev 2 (draft, not sent) for Wasatch Mechanical Contractors (Dana Ortiz)');
    const sent=sampleDetail({editable:false,valid_until:'2026-10-07',quote:{status:'sent',revision:1,valid_until:'2026-10-07'}});
    expect(summaryOf(sent).split('\n').slice(0,2)).toEqual(['Quote Q-24817 rev 1 for Wasatch Mechanical Contractors (Dana Ortiz)','Valid until Oct 7, 2026 · Will call at SLC']);
  });

  it('adds the payment terms when it has them, and leaves out a missing contact',()=>{
    const text=summaryOf(sampleDetail({quote:{contact_name:null}}),'Net 30');
    expect(text.split('\n').slice(0,2)).toEqual(['Quote Q-24817 rev 1 (draft, not sent) for Wasatch Mechanical Contractors','Valid until Oct 9, 2026 · Net 30 · Will call at SLC']);
  });

  it('shows delivery with the ship-to, and leaves an open price, call for freight and the total to be confirmed',()=>{
    const q:SummaryQuote={quote_number:'Q-24830',revision:1,draft:false,customer:{name:'Wasatch Mechanical Contractors',account_number:'WAS-1142'},contact:'Dana Ortiz',
      valid_until:'2026-10-09',terms:null,fulfillment:'delivery',branch:'SLC',ship_to:'1800 W 10950 S, South Jordan, UT 84095',
      lines:[{sku:'FD-45-60Z',description:'Flap disc 4.5 in, 60 grit zirconia',pack:'Box of 10',qty:2,unit_price:null,total:null},
        {sku:'RIV-18-AL',description:'Blind rivet 1/8 in, aluminum',pack:'Each',qty:500,unit_price:0.0825,total:41.25}],
      subtotal:41.25,freight:null,total:null};
    expect(quoteSummaryText(q)).toBe([
      'Quote Q-24830 rev 1 for Wasatch Mechanical Contractors (Dana Ortiz)',
      'Valid until Oct 9, 2026 · Delivery from SLC to 1800 W 10950 S, South Jordan, UT 84095',
      '',
      '2 x FD-45-60Z Flap disc 4.5 in (Box of 10) @ price to be confirmed',
      '500 x RIV-18-AL Blind rivet 1/8 in @ $0.0825 = $41.25',
      '',
      'Items $41.25 · Freight to be confirmed · Total to be confirmed',
    ].join('\n'));
    expect(quoteSummaryText({...q,ship_to:null,freight:62.5,total:103.75}).split('\n')).toEqual(expect.arrayContaining([
      'Valid until Oct 9, 2026 · Delivery from SLC','Items $41.25 · Freight $62.50 · Total $103.75 before tax']));
  });

  it('follows the lines on screen: an edited qty or price, a removed line, an added one',()=>{
    const detail=sampleDetail();
    const lines=[{...detail.lines[0],qty:12},...detail.lines.slice(1,3),detailLine(ITEMS.discs,{n:5,qty:2,unit_price:47.5,price_basis:'customer'})];
    const text=quoteSummaryText(summaryQuoteOf(detail,lines,figuresOf({...detail,lines})));
    expect(text).toContain('12 x HCS-12-13-2G8 Hex cap screw 1/2-13 x 2 in (Box of 50) @ $31.50 = $378.00');
    expect(text).not.toContain('RS-2-27-JH');
    expect(text).toContain('2 x FD-45-60Z Flap disc 4.5 in (Box of 10) @ $47.50 = $95.00');
    expect(text).toContain('Items $1,005.00 · Freight $0.00 · Total $1,005.00 before tax');
  });

  it('prices each line at the customer-facing price (unit price + freight recovery), with nothing about the recovery (spec §4.5)',()=>{
    const lines=[{...SAMPLE_LINES[0],freight_recovery:240},...SAMPLE_LINES.slice(1)];
    const detail=sampleDetail({lines});
    const text=summaryOf(detail);
    expect(text).toContain('10 x HCS-12-13-2G8 Hex cap screw 1/2-13 x 2 in (Box of 50) @ $33.90 = $339.00');
    expect(text).toContain('Items $1,146.40 · Freight $0.00 · Total $1,146.40 before tax');
    expect(text).not.toMatch(/recover|2\.40|31\.50/i);
  });

  it('copies only customer fields from the detail: nothing else rides along',()=>{
    const q=summaryQuoteOf(sampleDetail(),SAMPLE_LINES,figuresOf(sampleDetail()));
    expect(Object.keys(q).sort()).toEqual(['branch','contact','customer','draft','freight','fulfillment','lines','quote_number','revision','ship_to','subtotal','terms','total','valid_until']);
    for(const line of q.lines)expect(Object.keys(line).sort()).toEqual(['description','pack','qty','sku','total','unit_price']);
  });
});
