// @vitest-environment node
import type Anthropic from '@anthropic-ai/sdk';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {useSeededDatabase} from '@/server/repository/test-db';
import type {ChipFacts} from '@/server/upsells-writer/facts';

// "Suggested by Querent" for the rep (task 3.6; spec §4, §5.5): the chips from task 1.6, worded by
// a writer that sees only cost-free facts (never the real API here: fake writers and a fake
// client), and taking a chip through the line-edit service (task 3.3), with its refusals.
useSeededDatabase();

const NOW='2026-09-23T18:00:00.000Z';
const load=async()=>({
  upsells:await import('./quote-upsells'),
  edits:await import('./quote-edits'),
  math:await import('./quote-math'),
  repo:await import('@/server/repository'),
  service:await import('@/server/quotes/service'),
  rules:await import('@/server/upsells'),
  claude:await import('@/server/upsells-writer/claude'),
  facts:await import('@/server/upsells-writer/facts'),
});

beforeEach(async()=>{vi.stubEnv('QUERENT_SCRIPTED','1');(await import('@/server/quotes/service')).resetSample();});
afterEach(()=>{vi.unstubAllEnvs();});

const templates=async()=>(await (await load()).upsells.repQuoteUpsells('brandi','Q-24817',{now:NOW,writer:undefined}))!;
/** "Querent found" for a detail's lines, as the page computes it (quoteFigures, task 3.3). */
async function querentFound(detail:{lines:import('./quote-math').DetailLine[];freight:import('@/server/freight/engine').QuoteFreight;delivery_rates:import('@/domain').DeliveryRates;floors:import('@/server/floors').FloorRow[]}){
  const {math}=await load();
  return math.quoteFigures(detail.lines,{freight:detail.freight,rates:detail.delivery_rates,branchCode:'SLC',floor:{repId:'brandi',repName:'Brandi Gallegos',floors:detail.floors}}).querentFoundLabel;
}

/** Every number written in `text` (JSON or prose). */
const numbersIn=(text:string)=>[...text.matchAll(/\d+(?:\.\d+)?/g)].map(m=>Number(m[0]));
/** Money a chip carries that must not reach the model: unit cost, Querent's price, GP gain, and the line totals they make. */
function moneyOf(chip:import('@/server/upsells').Upsell){
  return [chip.unit_cost,chip.unit_price,chip.gp_gain,chip.unit_cost*chip.qty,chip.unit_price*chip.qty].map(v=>Math.round(v*100)/100);
}

describe('the chips on Q-24817',()=>{
  it('are 1.6\'s five, in the template wording when no writer runs (scripted mode)',async()=>{
    const result=await templates();
    expect(result.editable).toBe(true);
    expect(result.upsells.map(u=>[u.id,u.qty,u.unit_price,u.gp_gain,u.wording_source])).toEqual([
      ['matching_fastener:HN-12-13-G8',5,18.15,41.75,'template'],
      ['bought_together:FD-45-60Z',3,44.25,39.75,'template'],
      ['matching_fastener:FW-12-G8',5,14.25,34.25,'template'],
      ['full_case:CW-45-045-T1',8,36,23.8,'template'],
      ['bought_together:SG-CLR-AF',2,29.9,23.4,'template'],
    ]);
    expect(result.upsells[0].wording.title).toBe('Hex nut 1/2-13, Grade 8, yellow zinc (box of 100)');
  });

  it('use no writer in scripted mode by default (QUERENT_SCRIPTED=1)',async()=>{
    const {upsells,claude}=await load();
    expect(claude.upsellWriter()).toBeUndefined();
    const result=(await upsells.repQuoteUpsells('brandi','Q-24817',{now:NOW}))!;
    expect(result.upsells.every(u=>u.wording_source==='template')).toBe(true);
  });

  it('are not found for another rep, and not offered on a quote that can\'t be edited (no writer call)',async()=>{
    const {upsells,repo,service}=await load();
    const writer=vi.fn();
    expect(await upsells.repQuoteUpsells('mara','Q-24817',{now:NOW,writer})).toBeUndefined();
    expect(await upsells.repQuoteUpsells('brandi','Q-99999',{now:NOW,writer})).toBeUndefined();
    expect(repo.quoteByNumber('Q-24816')!.status).toBe('accepted');
    expect(await upsells.repQuoteUpsells('brandi','Q-24816',{now:NOW,writer})).toEqual({quote_id:repo.quoteByNumber('Q-24816')!.id,editable:false,upsells:[]});
    const copy=service.duplicateQuote('Q-24817',{repId:'brandi',now:'2026-09-23T15:00:00.000Z'});
    await service.sendQuote(copy.id,{repId:'brandi',now:'2026-09-23T16:00:00.000Z'});
    expect(await upsells.repQuoteUpsells('brandi',copy.id,{now:NOW,writer})).toMatchObject({editable:false,upsells:[]});
    expect(await upsells.repQuoteUpsells('brandi',copy.id,{now:'2026-10-09T00:00:00.000Z',writer})).toMatchObject({editable:false,upsells:[]});
    expect(writer).not.toHaveBeenCalled();
  });
});

describe('what the writer is given: cost-free facts only',()=>{
  it('has no cost, price, basis, margin or GP key anywhere, and none of the chips\' money values',async()=>{
    const {upsells,facts}=await load();
    const seen:ChipFacts[][]=[];
    await upsells.repQuoteUpsells('brandi','Q-24817',{now:NOW,writer:async chips=>{seen.push(structuredClone([...chips]));return chips.map(()=>null);}});
    expect(seen).toHaveLength(1);
    const [sent]=seen;
    expect(sent.map(c=>c.id)).toHaveLength(5);
    expect(facts.costKeys(sent)).toEqual([]);
    const chips=(await templates()).upsells;
    const text=JSON.stringify(sent);
    const numbers=new Set(numbersIn(text));
    for(const chip of chips)for(const value of moneyOf(chip)){
      expect(text).not.toContain(value.toFixed(2));
      if(!Number.isInteger(value))expect(numbers.has(value),`${chip.id}: ${value}`).toBe(false);
    }
    expect(text).not.toMatch(/\$|unit_cost|unit_price|price_basis|gp_gain|"contract"|"list"|"customer"/);
  });

  it('keeps the facts Claude needs: names, relation, counts and quantities, and the template',async()=>{
    const {upsells}=await load();
    const chips=(await templates()).upsells;
    expect(chips.map(upsells.chipFacts)).toEqual([
      expect.objectContaining({id:'matching_fastener:HN-12-13-G8',kind:'matching_fastener',qty:5,part:'nut',bolt:{diameter:'1/2',thread:'13',grade:'8'},bolt_pieces:500,pack_pieces:100,
        history:{orders_together:5,anchor_orders:5},item:{sku:'HN-12-13-G8',description:'Hex nut 1/2-13, Grade 8, yellow zinc',pack:'Box of 100'},
        anchor:{sku:'HCS-12-13-2G8',description:'Hex cap screw 1/2-13 x 2 in, Grade 8, yellow zinc'},history_months:12,template:chips[0].wording}),
      expect.objectContaining({id:'bought_together:FD-45-60Z',kind:'bought_together',qty:3,orders_together:4,anchor_orders:5}),
      expect.objectContaining({id:'matching_fastener:FW-12-G8',part:'washer'}),
      expect.objectContaining({id:'full_case:CW-45-045-T1',kind:'full_case',qty:8,case_qty:4,from_qty:6,to_qty:8,cases:2}),
      expect.objectContaining({id:'bought_together:SG-CLR-AF',kind:'bought_together',qty:2,orders_together:2,anchor_orders:4}),
    ]);
  });

  it('sends Claude a request with none of the chips\' cost, price or GP (the real writer over a fake client)',async()=>{
    const {upsells,claude}=await load();
    const bodies:Anthropic.MessageCreateParamsNonStreaming[]=[];
    const client={messages:{create:vi.fn(async(body:Anthropic.MessageCreateParamsNonStreaming)=>{
      bodies.push(body);
      const facts:ChipFacts[]=JSON.parse((body.messages[0].content as string).split('\n')[1]);
      return {id:'msg_1',type:'message',role:'assistant',model:body.model,stop_reason:'tool_use',stop_sequence:null,
        usage:{input_tokens:1,output_tokens:1,cache_creation_input_tokens:null,cache_read_input_tokens:null,server_tool_use:null,service_tier:null},
        content:[{type:'tool_use',id:'toolu_1',name:claude.WORDING_TOOL.name,input:{chips:facts.map(f=>({id:f.id,title:`Add ${f.item.sku}`,reason:`Goes with ${f.anchor.sku}.`}))}}]} as unknown as Anthropic.Message;
    })}};
    const result=(await upsells.repQuoteUpsells('brandi','Q-24817',{now:NOW,writer:claude.claudeChipWriter({client,model:'claude-sonnet-5'})}))!;
    expect(bodies).toHaveLength(1);
    const text=JSON.stringify(bodies[0]);
    for(const chip of result.upsells)for(const value of moneyOf(chip))expect(text).not.toContain(value.toFixed(2));
    expect(result.upsells.map(u=>[u.wording.title,u.wording_source])).toEqual(result.upsells.map(u=>[`Add ${u.item.sku}`,'claude']));
    // Cost and GP stay on the chips the rep gets.
    expect(result.upsells[0]).toMatchObject({unit_cost:9.8,unit_price:18.15,gp_gain:41.75});
  });
});

describe('the writer\'s wording',()=>{
  it('replaces the template per chip; a chip the writer skips keeps its template',async()=>{
    const {upsells}=await load();
    const result=(await upsells.repQuoteUpsells('brandi','Q-24817',{now:NOW,writer:async chips=>chips.map((c,i)=>i===1?null:{title:`Title ${c.item.sku}`,reason:'Reason.'})}))!;
    expect(result.upsells.map(u=>u.wording_source)).toEqual(['claude','template','claude','claude','claude']);
    expect(result.upsells[1].wording.title).toBe('Flap disc 4.5 in, 60 grit zirconia (box of 10)');
  });

  it('falls back to every template when the writer fails',async()=>{
    const {upsells}=await load();
    const result=(await upsells.repQuoteUpsells('brandi','Q-24817',{now:NOW,writer:async()=>{throw new Error('timeout');}}))!;
    expect(result.upsells.map(u=>u.wording)).toEqual((await templates()).upsells.map(u=>u.wording));
    expect(result.upsells.every(u=>u.wording_source==='template')).toBe(true);
  });
});

/** The chip as GET shows it now, and the body that takes it as shown. */
async function shown(id:string,quote='Q-24817'){
  const {upsells}=await load();
  const chip=(await upsells.repQuoteUpsells('brandi',quote,{now:NOW,writer:undefined}))!.upsells.find(u=>u.id===id);
  if(!chip)throw new Error(`No chip ${id} on ${quote}`);
  return chip;
}
const bodyOf=(chip:{id:string;fingerprint:string})=>({upsellId:chip.id,fingerprint:chip.fingerprint});
const take=async(id:string,quote='Q-24817')=>(await load()).upsells.takeRepQuoteUpsell('brandi',quote,bodyOf(await shown(id,quote)),{now:NOW});

describe('taking a chip',()=>{
  it('adds the nut as a suggested line through the line-edit service: priced, logged, and the chip is gone',async()=>{
    const {upsells,repo}=await load();
    const taken=await take('matching_fastener:HN-12-13-G8');
    const added=taken.detail.lines.find(l=>l.id===taken.line_id)!;
    expect(added).toMatchObject({sku:'HN-12-13-G8',qty:5,unit_price:18.15,price_basis:'custom',suggested_basis:'custom',customer_price:16.5,added_by:'upsell',line_no:5});
    expect(taken.detail.send_check.subtotal).toBe(1122.4+90.75);
    expect(repo.quoteActivity('q-24817').at(-1)).toMatchObject({actor:'rep',actor_id:'brandi',kind:'line_added',
      message:'Brandi added Hex nut 1/2-13 (HN-12-13-G8), qty 5, suggested by Querent'});
    // The nut chip is gone. 5 boxes of nuts is a broken case (10 to a case), so 1.6's full_case rule now offers the rest of the case.
    const after=(await upsells.repQuoteUpsells('brandi','Q-24817',{now:NOW,writer:undefined}))!;
    expect(after.upsells.map(u=>[u.id,u.gp_gain])).toEqual([['bought_together:FD-45-60Z',39.75],['matching_fastener:FW-12-G8',34.25],['full_case:HN-12-13-G8',25.25],
      ['full_case:CW-45-045-T1',23.8],['bought_together:SG-CLR-AF',23.4]]);
    expect(after.upsells[2].wording.title).toBe('Bump hex nuts to 10 boxes (1 full case)');
    // "Querent found" is §5.1's price uplift: the nut's broken-case price (customer + 10%) over its customer price, (18.15 - 16.50) x 5.
    expect(await querentFound(taken.detail)).toBe('Querent found +$19.75 GP');
  });

  it('bumps the wheels to the full case; the contract price stays, and "Querent found" doesn\'t move (contract lines add none)',async()=>{
    const {upsells,repo}=await load();
    const taken=await take('full_case:CW-45-045-T1');
    expect(taken.line_id).toBe('q-24817-2');
    expect(taken.detail.lines.find(l=>l.id==='q-24817-2')).toMatchObject({qty:8,unit_price:36,price_basis:'contract'});
    expect(taken.detail.send_check.subtotal).toBe(1122.4+72);
    expect(repo.quoteActivity('q-24817').at(-1)).toMatchObject({kind:'line_changed',message:'Brandi changed Cut-off wheel 4.5 x .045 x 7/8 in (CW-45-045-T1): qty 6 to 8'});
    expect(await querentFound(taken.detail)).toBe('Querent found +$11.50 GP');
    expect((await upsells.repQuoteUpsells('brandi','Q-24817',{now:NOW,writer:undefined}))!.upsells.map(u=>u.id)).not.toContain('full_case:CW-45-045-T1');
  });

  it('comes back once the change is undone (the line removed, the qty put back)',async()=>{
    const {upsells,edits}=await load();
    const ids=async()=>(await upsells.repQuoteUpsells('brandi','Q-24817',{now:NOW,writer:undefined}))!.upsells.map(u=>u.id);
    const all=await ids();
    const nut=await take('matching_fastener:HN-12-13-G8');
    await take('full_case:CW-45-045-T1');
    expect(await ids()).toEqual(['bought_together:FD-45-60Z','matching_fastener:FW-12-G8','full_case:HN-12-13-G8','bought_together:SG-CLR-AF']);
    await edits.editRepQuoteLine('brandi','Q-24817','q-24817-2',{qty:6},{now:NOW});
    await edits.removeRepQuoteLine('brandi','Q-24817',nut.line_id,{now:NOW});
    expect(await ids()).toEqual(all);
  });

  it('fingerprints what the chip shows: its id, what it changes, the qty and Querent\'s price',async()=>{
    const {upsells}=await load();
    expect((await upsells.repQuoteUpsells('brandi','Q-24817',{now:NOW,writer:undefined}))!.upsells.map(u=>u.fingerprint)).toEqual([
      'matching_fastener:HN-12-13-G8|add 5|18.15',
      'bought_together:FD-45-60Z|add 3|44.25',
      'matching_fastener:FW-12-G8|add 5|14.25',
      'full_case:CW-45-045-T1|q-24817-2 6->8|36.00',
      'bought_together:SG-CLR-AF|add 2|29.90',
    ]);
  });

  it('refuses a chip that changed since it was shown (409) and writes nothing: the verifier\'s repro (F1)',async()=>{
    const {upsells,edits,repo}=await load();
    const wheels=await shown('full_case:CW-45-045-T1');
    const nut=await shown('matching_fastener:HN-12-13-G8');
    expect([wheels.action,nut.qty,nut.unit_price]).toEqual([{type:'set_qty',line_id:'q-24817-2',item_id:'CW-45-045-T1',from_qty:6,to_qty:8},5,18.15]);
    // Elsewhere (another tab), the wheels go to 9 and the bolts to 20: the same ids now mean 9 -> 12, and 10 nuts at $16.50.
    await edits.editRepQuoteLine('brandi','Q-24817','q-24817-2',{qty:9},{now:NOW});
    await edits.editRepQuoteLine('brandi','Q-24817','q-24817-1',{qty:20},{now:NOW});
    const lines=repo.quote('q-24817')!.lines;
    const changed={code:'conflict',httpStatus:409,message:'That suggestion changed since it was shown. Check the updated suggestions and try again.'};
    await expect(upsells.takeRepQuoteUpsell('brandi','Q-24817',bodyOf(wheels),{now:NOW})).rejects.toMatchObject(changed);
    await expect(upsells.takeRepQuoteUpsell('brandi','Q-24817',bodyOf(nut),{now:NOW})).rejects.toMatchObject(changed);
    expect(repo.quote('q-24817')!.lines).toEqual(lines);
    // Taken as shown now, they apply as shown.
    const [freshWheels,freshNut]=[await shown('full_case:CW-45-045-T1'),await shown('matching_fastener:HN-12-13-G8')];
    expect([freshWheels.fingerprint,freshNut.fingerprint]).toEqual(['full_case:CW-45-045-T1|q-24817-2 9->12|36.00','matching_fastener:HN-12-13-G8|add 10|16.50']);
    expect((await upsells.takeRepQuoteUpsell('brandi','Q-24817',bodyOf(freshWheels),{now:NOW})).detail.lines.find(l=>l.id==='q-24817-2')!.qty).toBe(12);
    expect((await upsells.takeRepQuoteUpsell('brandi','Q-24817',bodyOf(freshNut),{now:NOW})).detail.lines.at(-1)).toMatchObject({sku:'HN-12-13-G8',qty:10,unit_price:16.5});
  });

  it('refuses a chip that no longer applies, or never did (409), and bad input (400)',async()=>{
    const {upsells,repo}=await load();
    const nut=await shown('matching_fastener:HN-12-13-G8');
    await upsells.takeRepQuoteUpsell('brandi','Q-24817',bodyOf(nut),{now:NOW});
    const lines=repo.quote('q-24817')!.lines;
    await expect(upsells.takeRepQuoteUpsell('brandi','Q-24817',bodyOf(nut),{now:NOW}))
      .rejects.toMatchObject({code:'conflict',httpStatus:409,message:'That suggestion no longer applies to Q-24817.'});
    await expect(upsells.takeRepQuoteUpsell('brandi','Q-24817',{upsellId:'bought_together:DT-2-60',fingerprint:'bought_together:DT-2-60|add 1|9.99'},{now:NOW})).rejects.toMatchObject({code:'conflict'});
    const washer=await shown('matching_fastener:FW-12-G8');
    await expect(upsells.takeRepQuoteUpsell('brandi','Q-24817',{...bodyOf(washer),fingerprint:'matching_fastener:FW-12-G8|add 50|14.25'},{now:NOW})).rejects.toMatchObject({code:'conflict'});
    for(const body of [undefined,{},{upsellId:''},{upsellId:7},{upsellId:washer.id},{fingerprint:washer.fingerprint},{upsellId:washer.id,fingerprint:''},
      {upsellId:'x'.repeat(121),fingerprint:washer.fingerprint},{upsellId:washer.id,fingerprint:'y'.repeat(201)},{...bodyOf(washer),qty:99}])
      await expect(upsells.takeRepQuoteUpsell('brandi','Q-24817',body,{now:NOW})).rejects.toMatchObject({code:'invalid_input',httpStatus:400});
    expect(repo.quote('q-24817')!.lines).toEqual(lines);
  });

  it('refuses another rep\'s quote (404) and sent, accepted or expired quotes (409 via canEditDraft), writing nothing',async()=>{
    const {upsells,repo,service}=await load();
    const chip=bodyOf(await shown('full_case:CW-45-045-T1'));
    await expect(upsells.takeRepQuoteUpsell('mara','Q-24817',chip,{now:NOW})).rejects.toMatchObject({code:'not_found',httpStatus:404});
    const accepted=repo.quoteByNumber('Q-24816')!;
    await expect(upsells.takeRepQuoteUpsell('brandi','Q-24816',chip,{now:NOW}))
      .rejects.toMatchObject({code:'illegal_transition',httpStatus:409,message:'Q-24816 was accepted, so it can\'t be edited. Duplicate it to quote again.'});
    expect(repo.quoteByNumber('Q-24816')).toEqual(accepted);
    const copy=service.duplicateQuote('Q-24817',{repId:'brandi',now:'2026-09-23T15:00:00.000Z'});
    const copyChip=bodyOf(await shown('full_case:CW-45-045-T1',copy.id));
    await service.sendQuote(copy.id,{repId:'brandi',now:'2026-09-23T16:00:00.000Z'});
    const sent=repo.quote(copy.id)!;
    await expect(upsells.takeRepQuoteUpsell('brandi',copy.id,copyChip,{now:NOW})).rejects.toMatchObject({code:'illegal_transition',httpStatus:409,message:/was sent to the customer/});
    await expect(upsells.takeRepQuoteUpsell('brandi',copy.id,copyChip,{now:'2026-10-09T00:00:00.000Z'})).rejects.toMatchObject({code:'illegal_transition',message:/expired/});
    expect(repo.quote(copy.id)).toEqual(sent);
  });

  it('works on a changes_requested quote (editable, spec §5.4)',async()=>{
    const {upsells,service,repo}=await load();
    const copy=service.duplicateQuote('Q-24817',{repId:'brandi',now:'2026-09-23T15:00:00.000Z'});
    await service.sendQuote(copy.id,{repId:'brandi',now:'2026-09-23T16:00:00.000Z'});
    service.requestChanges('wasatch',copy.id,{revision:1,note:'Add nuts please',now:'2026-09-23T17:00:00.000Z'});
    expect(repo.quote(copy.id)!.status).toBe('changes_requested');
    expect((await upsells.repQuoteUpsells('brandi',copy.id,{now:NOW,writer:undefined}))!.editable).toBe(true);
    const taken=await take('matching_fastener:HN-12-13-G8',copy.id);
    expect(taken.detail.lines.at(-1)).toMatchObject({sku:'HN-12-13-G8',added_by:'upsell'});
  });
});
