import {fireEvent,render,screen,within} from '@testing-library/react';
import {describe,expect,it,vi} from 'vitest';
import {linePricing} from '@/server/rep/quote-math';
import {PriceBasisSelect} from './PriceBasisSelect';
import {SAMPLE_LINES} from './test-fixtures';

// The price-basis dropdown (task 3.3, spec §4): Contract / Customer / List / Last paid / Custom,
// each with its $ value, and Querent's pick in bold.

const [bolts,wheels]=SAMPLE_LINES;
const options=linePricing(bolts)!.options;

function renderSelect(props:Partial<Parameters<typeof PriceBasisSelect>[0]>={}){
  const onChange=vi.fn();
  render(<PriceBasisSelect options={options} value="last_paid" onChange={onChange} label="Price basis for HCS-12-13-2G8" {...props}/>);
  return {onChange,button:screen.getByRole('button',{name:'Price basis for HCS-12-13-2G8: Last paid'})};
}

describe('price-basis dropdown',()=>{
  it('shows the current basis and opens a list of every basis with its $ value',()=>{
    const {button}=renderSelect();
    expect(button).toHaveTextContent('Last paid');
    expect(button).toHaveAttribute('aria-haspopup','listbox');
    expect(button).toHaveAttribute('aria-expanded','false');
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded','true');
    const list=screen.getByRole('listbox',{name:'Price basis for HCS-12-13-2G8'});
    expect(within(list).getAllByRole('option').map(o=>o.textContent)).toEqual([
      'Contract—','Customer$30.95','List$38.95','Last paidQuerent’s pickPaid Aug 12$31.50','CustomType a price',
    ]);
    expect(list).toHaveFocus();
  });

  it('puts Querent’s pick in bold, and only the pick',()=>{
    renderSelect();
    fireEvent.click(screen.getByRole('button'));
    const pick=screen.getByRole('option',{name:/Last paid/});
    expect(pick).toHaveAttribute('data-suggested','true');
    expect(pick).toHaveAttribute('aria-selected','true');
    expect(within(pick).getAllByText(/Last paid|\$31\.50/).every(el=>el.tagName==='STRONG')).toBe(true);
    for(const other of screen.getAllByRole('option').filter(o=>o!==pick))expect(other.querySelector('strong')).toBeNull();
  });

  it('chooses a basis by click, and never one with no price',()=>{
    const {onChange}=renderSelect();
    fireEvent.click(screen.getByRole('button'));
    const contract=screen.getByRole('option',{name:/Contract/});
    expect(contract).toHaveAttribute('aria-disabled','true');
    fireEvent.click(contract);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('option',{name:/^List/}));
    expect(onChange).toHaveBeenCalledWith('list');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByRole('button')).toHaveFocus();
  });

  it('works from the keyboard: arrows skip bases with no price, Enter chooses, Escape closes',()=>{
    const {onChange,button}=renderSelect();
    fireEvent.keyDown(button,{key:'ArrowDown'});
    const list=screen.getByRole('listbox');
    const active=()=>document.getElementById(list.getAttribute('aria-activedescendant')!)!.textContent;
    expect(active()).toMatch(/^Last paid/);
    fireEvent.keyDown(list,{key:'ArrowDown'});
    expect(active()).toMatch(/^Custom/);
    fireEvent.keyDown(list,{key:'ArrowDown'});
    expect(active()).toMatch(/^Customer/);
    fireEvent.keyDown(list,{key:'ArrowUp'});
    fireEvent.keyDown(list,{key:'ArrowUp'});
    expect(active()).toMatch(/^Last paid/);
    fireEvent.keyDown(list,{key:'Escape'});
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(button,{key:'ArrowDown'});
    fireEvent.keyDown(screen.getByRole('listbox'),{key:'ArrowUp'});
    fireEvent.keyDown(screen.getByRole('listbox'),{key:'Enter'});
    expect(onChange).toHaveBeenCalledWith('list');
  });

  it('bolds the contract when Querent picks it, with the contract number',()=>{
    render(<PriceBasisSelect options={linePricing(wheels)!.options} value="contract" onChange={()=>{}} label="Price basis for CW-45-045-T1"/>);
    fireEvent.click(screen.getByRole('button'));
    const contract=screen.getByRole('option',{name:/Contract/});
    expect(contract).toHaveTextContent('ContractQuerent’s pickWAS-C-2026-01$36.00');
    expect(contract.querySelector('strong')).toHaveTextContent('Contract');
  });

  it('can be disabled (read-only quotes)',()=>{
    renderSelect({disabled:true});
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
