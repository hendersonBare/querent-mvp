import {act,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {describe,expect,it,vi} from 'vitest';
import {QuoteReviewDialog} from './QuoteReviewDialog';
import {sampleRun} from './test-fixtures';
import type {SaveQuoteRequest,ScoredItem} from './types';
import {pricingUnit} from './units';

// The review dialog (docs/boxt/plan.md B5): matched lines with the customer's text, item, SKU, pack,
// the web list price as a label, qty and an empty price; unmatched lines with near-misses and "Use this
// item"; Swap and Remove/Undo; Save gated on prices and quantities; Escape asks first once edited.

function setup(overrides:Partial<Parameters<typeof QuoteReviewDialog>[0]>={}){
  const save=vi.fn(async(_body:SaveQuoteRequest)=>({id:'new-quote-id'}));
  const onSaved=vi.fn(),onClose=vi.fn();
  const search=vi.fn(async(_q:string):Promise<ScoredItem[]>=>[]);
  render(<QuoteReviewDialog run={sampleRun()} onClose={onClose} onSaved={onSaved} save={save} search={search} {...overrides}/>);
  return {save,onSaved,onClose,search,dialog:screen.getByRole('dialog',{name:'Review quote'})};
}

const matchedSection=()=>screen.getByRole('region',{name:/^Matched/});
const unmatchedSection=()=>screen.getByRole('region',{name:/^Unmatched/});
const saveButton=()=>screen.getByRole('button',{name:'Save quote'});
const type=(element:HTMLElement,value:string)=>fireEvent.change(element,{target:{value}});

function priceAll(){
  type(screen.getByLabelText('Unit price for 12108-BDL'),'0.79');
  type(screen.getByLabelText('Unit price for SF188CAST'),'24.5');
  type(screen.getByLabelText('Quantity for SF188CAST'),'3');
}

describe('QuoteReviewDialog',()=>{
  it('is a modal titled "Review quote" with the counts, and takes focus',()=>{
    const {dialog}=setup();
    expect(dialog).toHaveAttribute('aria-modal','true');
    expect(dialog).toHaveTextContent('2 matched, 2 could not be matched');
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('shows each matched line: what the customer wrote, the item, SKU, pack and the web list price as a label, with an empty price',()=>{
    setup();
    const line=within(matchedSection()).getByTestId('line-0');
    expect(line).toHaveTextContent('Customer wrote: S-4128 12 x 10 x 8" Corrugated Boxes 10 bundles');
    expect(line).toHaveTextContent('12x10x8" Corrugated Boxes, 32 ECT, bundle pricing');
    expect(line).toHaveTextContent('12108-BDL');
    expect(line).toHaveTextContent('Bundle of 25');
    expect(line).toHaveTextContent('Web list: $0.84/each');
    const price=within(line).getByLabelText('Unit price for 12108-BDL');
    expect(price).toHaveValue('');
    expect(price).toHaveAttribute('inputmode','decimal');
    expect(within(line).getByLabelText('Quantity for 12108-BDL')).toHaveValue('250');
    expect(line).not.toHaveTextContent('Check quantity');
  });

  it('puts quantity and unit price in the item\'s pricing unit, with the customer\'s bundles converted and said so',()=>{
    setup();
    const box=within(matchedSection()).getByTestId('line-0');
    expect(within(box).getByTestId('qty-unit')).toHaveTextContent(/^each$/);
    expect(within(box).getByTestId('price-unit')).toHaveTextContent(/^per each$/);
    expect(box).toHaveTextContent('Customer asked for 10 bundles = 250 each');
    expect(box).toHaveTextContent('Web list: $0.84/each');
    const wrap=within(matchedSection()).getByTestId('line-1');
    expect(within(wrap).getByTestId('price-unit')).toHaveTextContent(/^per case$/);
    type(within(wrap).getByLabelText('Quantity for SF188CAST'),'3');
    expect(within(wrap).getByTestId('qty-unit')).toHaveTextContent(/^cases$/);
    type(within(wrap).getByLabelText('Quantity for SF188CAST'),'1');
    expect(within(wrap).getByTestId('qty-unit')).toHaveTextContent(/^case$/);
  });

  it('keeps a quantity it cannot convert exactly, flags it with what the customer wrote, and turns the flag into a note once edited',()=>{
    const run=sampleRun();
    run.lines[0]={...run.lines[0],rawText:'12x10x8 boxes 10 pallets',quantity:10,unit:'pallet'};
    render(<QuoteReviewDialog run={run} onClose={()=>{}} onSaved={()=>{}} save={async()=>({id:'x'})} search={async()=>[]}/>);
    const line=within(matchedSection()).getByTestId('line-0');
    expect(within(line).getByLabelText('Quantity for 12108-BDL')).toHaveValue('10');
    expect(line).toHaveTextContent('Check quantity (customer wrote: 10 pallets)');
    type(within(line).getByLabelText('Quantity for 12108-BDL'),'5000');
    expect(line).not.toHaveTextContent('Check quantity');
    expect(line).toHaveTextContent('Customer wrote: 10 pallets');
  });

  it('says under Save how many lines have a quantity to check, without blocking Save',()=>{
    const run=sampleRun();
    run.lines[0]={...run.lines[0],rawText:'12x10x8 boxes 10 pallets',quantity:10,unit:'pallet'};
    render(<QuoteReviewDialog run={run} onClose={()=>{}} onSaved={()=>{}} save={async()=>({id:'x'})} search={async()=>[]}/>);
    type(screen.getByLabelText('Unit price for 12108-BDL'),'1');
    type(screen.getByLabelText('Unit price for SF188CAST'),'24.5');
    type(screen.getByLabelText('Quantity for SF188CAST'),'3');
    expect(saveButton()).toBeEnabled();
    expect(screen.getByText('1 line has a quantity to check.')).toBeInTheDocument();
    type(screen.getByLabelText('Quantity for 12108-BDL'),'12');
    expect(screen.queryByText(/quantity to check/)).toBeNull();
  });

  it('flags an unclear quantity with "Check quantity"',()=>{
    setup();
    const line=within(matchedSection()).getByTestId('line-1');
    expect(line).toHaveTextContent('Check quantity');
    expect(within(line).getByLabelText('Quantity for SF188CAST')).toHaveValue('');
  });

  it('keeps Save disabled until every matched line has a valid price and quantity, and says why',()=>{
    setup();
    expect(saveButton()).toBeDisabled();
    expect(screen.getByText('Add a price to 2 lines and a quantity to 1 line.')).toBeInTheDocument();
    type(screen.getByLabelText('Unit price for 12108-BDL'),'0.79');
    type(screen.getByLabelText('Unit price for SF188CAST'),'24.5');
    expect(screen.getByText('Add a quantity to 1 line.')).toBeInTheDocument();
    type(screen.getByLabelText('Quantity for SF188CAST'),'3');
    expect(saveButton()).toBeEnabled();
    type(screen.getByLabelText('Unit price for 12108-BDL'),'-1');
    expect(saveButton()).toBeDisabled();
    expect(screen.getByLabelText('Unit price for 12108-BDL')).toHaveAttribute('aria-invalid','true');
  });

  it('explains a quantity it cannot save with the shared field messages (above 0, up to 3 decimals)',()=>{
    setup();
    const qty=screen.getByLabelText('Quantity for 12108-BDL');
    for(const [bad,message] of [['0','Enter a quantity above 0.'],['0.0004','Enter a quantity of at least 0.001.'],['1.2345','Use up to 3 decimals.'],['-2','Enter a quantity above 0.']]){
      type(qty,bad);
      expect(qty).toHaveAttribute('aria-invalid','true');
      expect(within(matchedSection()).getByTestId('line-0')).toHaveTextContent(message);
    }
    type(qty,'2.125');
    expect(qty).toHaveAttribute('aria-invalid','false');
    type(screen.getByLabelText('Unit price for 12108-BDL'),'1.1235');
    expect(within(matchedSection()).getByTestId('line-0')).toHaveTextContent('$2.39');
  });

  it('shows line totals and the quote total in dollars',()=>{
    setup();
    priceAll();
    // 250 each x $0.79 per each; 3 cases x $24.50 per case.
    expect(within(matchedSection()).getByTestId('line-0')).toHaveTextContent('$197.50');
    expect(within(matchedSection()).getByTestId('line-1')).toHaveTextContent('$73.50');
    expect(screen.getByTestId('quote-total')).toHaveTextContent('$271.00');
  });

  it('lists unmatched lines with "Could not detect a match" and their closest items behind a toggle',()=>{
    setup();
    const line=within(unmatchedSection()).getByTestId('line-2');
    expect(line).toHaveTextContent('Reclosable bags 30x30 3 mil 4 cases');
    expect(line).toHaveTextContent('Could not detect a match');
    expect(within(line).queryByText('PB3669')).toBeNull();
    fireEvent.click(within(line).getByRole('button',{name:'Show 2 closest items'}));
    const misses=within(line).getAllByTestId('near-miss');
    expect(misses).toHaveLength(2);
    expect(misses[0]).toHaveTextContent('Reclosable Poly Bags 30x30" 2 Mil');
    expect(misses[0]).toHaveTextContent('PB3669');
    expect(misses[0]).toHaveTextContent('Case of 250');
    expect(misses[0]).toHaveTextContent('Similarity 56%');
    for(const miss of misses)expect(miss).not.toHaveTextContent(/% match/i);
    expect(within(unmatchedSection()).getByTestId('line-3')).toHaveTextContent('No similar items');
  });

  it('shows "Could not detect a match" for any reason, with a short hint for known reasons only',()=>{
    const run=sampleRun();
    run.lines[2]={...run.lines[2],reason:'low_lead'};
    run.lines[3]={...run.lines[3],reason:'a_reason_added_later' as never};
    render(<QuoteReviewDialog run={run} onClose={()=>{}} onSaved={()=>{}} save={async()=>({id:'x'})} search={async()=>[]}/>);
    const known=within(unmatchedSection()).getByTestId('line-2');
    expect(known).toHaveTextContent('Could not detect a match');
    expect(known).toHaveTextContent('More than one catalog item fits about as well.');
    const unknown=within(unmatchedSection()).getByTestId('line-3');
    expect(unknown).toHaveTextContent('Could not detect a match');
    expect(unknown).not.toHaveTextContent('a_reason_added_later');
  });

  it('shows the matcher\'s blockers as a short hint on an unmatched line',()=>{
    const run=sampleRun();
    run.lines[2]={...run.lines[2],reason:'not_accounted',eligibility:{strictEligible:false,blockers:['two sizes: 30x30 and 4x6']}};
    render(<QuoteReviewDialog run={run} onClose={()=>{}} onSaved={()=>{}} save={async()=>({id:'x'})} search={async()=>[]}/>);
    const line=within(unmatchedSection()).getByTestId('line-2');
    expect(line).toHaveTextContent('Could not detect a match');
    expect(line).toHaveTextContent('Not matched automatically: the line names two sizes: 30x30 and 4x6.');
  });

  it('"Use this item" moves the line to Matched, picked by the rep, with an empty price',async()=>{
    const {save}=setup();
    const line=within(unmatchedSection()).getByTestId('line-2');
    fireEvent.click(within(line).getByRole('button',{name:'Show 2 closest items'}));
    fireEvent.click(within(within(line).getAllByTestId('near-miss')[1]).getByRole('button',{name:'Use this item'}));
    const promoted=within(matchedSection()).getByTestId('line-2');
    expect(promoted).toHaveTextContent('PB3670');
    // The same words as the quote's page.
    expect(within(promoted).getByText('Picked by rep')).toBeInTheDocument();
    expect(within(promoted).getByLabelText('Unit price for PB3670')).toHaveValue('');
    expect(within(promoted).getByLabelText('Quantity for PB3670')).toHaveValue('4');
    expect(within(promoted).getByTestId('qty-unit')).toHaveTextContent(/^cases$/);
    expect(within(promoted).getByTestId('price-unit')).toHaveTextContent(/^per case$/);
    expect(screen.getByRole('dialog')).toHaveTextContent('3 matched, 1 could not be matched');
    priceAll();
    type(within(promoted).getByLabelText('Unit price for PB3670'),'99');
    fireEvent.click(saveButton());
    await waitFor(()=>expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0][0].lines[2]).toEqual({unmatched:false,sku:'PB3670',matchedBy:'rep',originalText:'Reclosable bags 30x30 3 mil 4 cases',quantity:4,unit:'case',quantityUnclear:false,customerQuantity:null,unitPrice:99,matchScore:0.42});
  });

  it('Swap offers the line\'s other candidates and a catalog search; choosing one makes it the rep\'s pick',async()=>{
    const found:ScoredItem={sku:'SF187CAST',description:'Cast Stretch Wrap 18"x1500\' 70 Gauge',pack:'Case of 4',category:'Stretch Film',listPrice:70,listPriceUnit:'case',pricing:pricingUnit('Case of 4',1),score:0.8};
    const search=vi.fn(async(_q:string)=>[found]);
    const {save}=setup({search});
    const line=within(matchedSection()).getByTestId('line-0');
    fireEvent.click(within(line).getByRole('button',{name:'Swap'}));
    const picker=within(line).getByRole('group',{name:'Swap item'});
    expect(within(picker).getByText('12108-PLT')).toBeInTheDocument();
    expect(within(picker).queryByText('12108-BDL')).toBeNull();
    fireEvent.click(within(picker).getByRole('button',{name:/Use 12108-PLT/}));
    expect(within(line).queryByRole('group',{name:'Swap item'})).toBeNull();
    expect(line).toHaveTextContent('12108-PLT');
    expect(line).toHaveTextContent('Web list: $0.71/each');
    expect(within(line).getByLabelText('Quantity for 12108-PLT')).toHaveValue('250');
    expect(line).toHaveTextContent('Customer asked for 10 bundles = 250 each');

    // Search the catalog from the second line's picker.
    const wrap=within(matchedSection()).getByTestId('line-1');
    fireEvent.click(within(wrap).getByRole('button',{name:'Swap'}));
    const box=within(wrap).getByRole('searchbox',{name:'Search the catalog'});
    await act(async()=>{type(box,'70 gauge');await new Promise(r=>setTimeout(r,350));});
    await waitFor(()=>expect(search).toHaveBeenCalledWith('70 gauge'));
    fireEvent.click(await within(wrap).findByRole('button',{name:/Use SF187CAST/}));
    expect(wrap).toHaveTextContent('SF187CAST');

    type(screen.getByLabelText('Unit price for 12108-PLT'),'0.7');
    type(screen.getByLabelText('Unit price for SF187CAST'),'60');
    type(screen.getByLabelText('Quantity for SF187CAST'),'2');
    fireEvent.click(saveButton());
    await waitFor(()=>expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0][0].lines.slice(0,2).map(l=>!l.unmatched&&[l.sku,l.matchedBy,l.quantity,l.unit])).toEqual([['12108-PLT','rep',250,'each'],['SF187CAST','rep',2,'case']]);
  });

  it('Swap to an item priced per another unit re-runs the conversion from the customer\'s quantity and clears the price',async()=>{
    const bags:ScoredItem={sku:'PB3669',description:'Reclosable Poly Bags 30x30" 2 Mil',pack:'Case of 250',category:'Poly Bags',listPrice:89,listPriceUnit:'case',pricing:pricingUnit('Case of 250',1),score:0.3};
    setup({search:async()=>[bags]});
    const line=within(matchedSection()).getByTestId('line-0');
    type(within(line).getByLabelText('Unit price for 12108-BDL'),'0.79');
    type(within(line).getByLabelText('Quantity for 12108-BDL'),'300');
    fireEvent.click(within(line).getByRole('button',{name:'Swap'}));
    await act(async()=>{type(within(line).getByRole('searchbox',{name:'Search the catalog'}),'poly bags');await new Promise(r=>setTimeout(r,350));});
    fireEvent.click(await within(line).findByRole('button',{name:/Use PB3669/}));
    expect(within(line).getByLabelText('Quantity for PB3669')).toHaveValue('10');
    expect(within(line).getByLabelText('Unit price for PB3669')).toHaveValue('');
    expect(within(line).getByTestId('price-unit')).toHaveTextContent(/^per case$/);
    expect(line).toHaveTextContent('Check quantity (customer wrote: 10 bundles)');
  });

  it('Remove takes a line out of the quote, with Undo until save',async()=>{
    const {save}=setup();
    const line=within(matchedSection()).getByTestId('line-0');
    fireEvent.click(within(line).getByRole('button',{name:'Remove'}));
    expect(within(matchedSection()).getByTestId('line-0')).toHaveTextContent('Removed');
    expect(screen.queryByLabelText('Unit price for 12108-BDL')).toBeNull();
    fireEvent.click(screen.getByRole('button',{name:'Undo'}));
    expect(screen.getByLabelText('Unit price for 12108-BDL')).toBeInTheDocument();

    fireEvent.click(within(within(matchedSection()).getByTestId('line-0')).getByRole('button',{name:'Remove'}));
    type(screen.getByLabelText('Unit price for SF188CAST'),'24.5');
    type(screen.getByLabelText('Quantity for SF188CAST'),'3');
    expect(screen.getByTestId('quote-total')).toHaveTextContent('$73.50');
    fireEvent.click(saveButton());
    await waitFor(()=>expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0][0].lines.map(l=>l.originalText)).not.toContain('S-4128 12 x 10 x 8" Corrugated Boxes 10 bundles');
    expect(save.mock.calls[0][0].lines).toHaveLength(3);
  });

  it('saves with the customer name and reference, then hands back the new id',async()=>{
    const {save,onSaved}=setup();
    type(screen.getByLabelText('Customer name'),'Acme Supply');
    type(screen.getByLabelText(/^Reference/),'PO 1182');
    priceAll();
    fireEvent.click(saveButton());
    await waitFor(()=>expect(onSaved).toHaveBeenCalledWith('new-quote-id'));
    expect(save.mock.calls[0][0]).toMatchObject({customerName:'Acme Supply',reference:'PO 1182',matchStrictness:'strict'});
    expect(save.mock.calls[0][0].lines.filter(l=>l.unmatched)).toHaveLength(2);
  });

  it('shows a save failure in one line and lets the rep try again',async()=>{
    const save=vi.fn().mockRejectedValueOnce(new Error('The quote could not be saved. Try again.')).mockResolvedValueOnce({id:'x'});
    const {onSaved}=setup({save});
    priceAll();
    fireEvent.click(saveButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('The quote could not be saved. Try again.');
    expect(saveButton()).toBeEnabled();
    fireEvent.click(saveButton());
    await waitFor(()=>expect(onSaved).toHaveBeenCalledWith('x'));
  });

  it('Escape closes at once without edits, and asks first once something was edited',()=>{
    const {onClose,dialog}=setup();
    fireEvent.keyDown(dialog,{key:'Escape'});
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('asks before discarding edits on Escape; Keep reviewing stays, Discard closes',()=>{
    const {onClose,dialog}=setup();
    type(screen.getByLabelText('Unit price for 12108-BDL'),'1');
    fireEvent.keyDown(dialog,{key:'Escape'});
    expect(onClose).not.toHaveBeenCalled();
    expect(dialog).toHaveTextContent('Discard this review?');
    fireEvent.click(screen.getByRole('button',{name:'Keep reviewing'}));
    expect(dialog).not.toHaveTextContent('Discard this review?');
    fireEvent.keyDown(dialog,{key:'Escape'});
    fireEvent.click(screen.getByRole('button',{name:'Discard'}));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps Tab inside the dialog',()=>{
    const {dialog}=setup();
    const buttons=within(dialog).getAllByRole('button').filter(b=>!(b as HTMLButtonElement).disabled);
    const last=buttons.at(-1)!;
    last.focus();
    fireEvent.keyDown(dialog,{key:'Tab'});
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(last);
  });

  it('after "Use" in the Swap picker, focus moves to that line\'s price, and Escape still asks before discarding',()=>{
    const {onClose,dialog}=setup();
    fireEvent.click(within(within(matchedSection()).getByTestId('line-0')).getByRole('button',{name:'Swap'}));
    fireEvent.click(screen.getByRole('button',{name:/Use 12108-PLT/}));
    expect(document.activeElement).toBe(screen.getByLabelText('Unit price for 12108-PLT'));
    fireEvent.keyDown(document.activeElement!,{key:'Escape'});
    expect(onClose).not.toHaveBeenCalled();
    expect(dialog).toHaveTextContent('Discard this review?');
  });

  it('after "Use this item", focus moves to the promoted line\'s price, and Escape still asks before discarding',()=>{
    const {onClose,dialog}=setup();
    const line=within(unmatchedSection()).getByTestId('line-2');
    fireEvent.click(within(line).getByRole('button',{name:'Show 2 closest items'}));
    fireEvent.click(within(within(line).getAllByTestId('near-miss')[0]).getByRole('button',{name:'Use this item'}));
    expect(document.activeElement).toBe(screen.getByLabelText('Unit price for PB3669'));
    fireEvent.keyDown(document.activeElement!,{key:'Escape'});
    expect(onClose).not.toHaveBeenCalled();
    expect(dialog).toHaveTextContent('Discard this review?');
  });

  it('keeps focus in the dialog through Remove, Undo and closing the Swap picker',()=>{
    setup();
    fireEvent.click(within(within(matchedSection()).getByTestId('line-0')).getByRole('button',{name:'Remove'}));
    expect(document.activeElement).toBe(screen.getByRole('button',{name:'Undo'}));
    fireEvent.click(screen.getByRole('button',{name:'Undo'}));
    expect(document.activeElement).toBe(screen.getByLabelText('Unit price for 12108-BDL'));
    const swap=within(within(matchedSection()).getByTestId('line-0')).getByRole('button',{name:'Swap'});
    fireEvent.click(swap);
    fireEvent.keyDown(screen.getByRole('searchbox',{name:'Search the catalog'}),{key:'Escape'});
    expect(screen.queryByRole('group',{name:'Swap item'})).toBeNull();
    expect(document.activeElement).toBe(swap);
  });

  it('still handles Escape when focus has left the dialog (asks first once edited)',()=>{
    const {onClose,dialog}=setup();
    type(screen.getByLabelText('Unit price for 12108-BDL'),'1');
    (document.activeElement as HTMLElement|null)?.blur();
    fireEvent.keyDown(document.body,{key:'Escape'});
    expect(onClose).not.toHaveBeenCalled();
    expect(dialog).toHaveTextContent('Discard this review?');
  });

  it('never uses an em dash in its copy',()=>{
    const {dialog}=setup();
    fireEvent.click(within(within(unmatchedSection()).getByTestId('line-2')).getByRole('button',{name:'Show 2 closest items'}));
    expect(dialog.textContent).not.toContain('—');
  });
});
