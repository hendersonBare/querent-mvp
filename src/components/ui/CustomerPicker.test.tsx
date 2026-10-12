import {fireEvent,render,screen,within} from '@testing-library/react';
import {describe,expect,it,vi} from 'vitest';
import {CustomerPicker,PICKER_VISIBLE_ROWS} from './CustomerPicker';

// The page-local customer picker (plan U0; frames C_QOB1 open, C_QOT7 typed): "All customers" first,
// then the customers in the order given. The list shows five rows and scrolls; typing narrows it by
// name or account number.

const customers=Array.from({length:9},(_,i)=>({id:`c${i}`,name:`Customer ${String.fromCharCode(65+i)}`,account_number:`ACC-${1000+i}`}))
  .concat([{id:'was',name:'Wasatch Mechanical Contractors',account_number:'WAS-1142'},{id:'wvr',name:'Wasatch Valley Roofing',account_number:'WVR-5520'}]);

const box=()=>screen.getByRole('combobox',{name:/^Customer/});
const list=()=>screen.getByRole('listbox');
const options=()=>within(list()).getAllByRole('option');

describe('CustomerPicker',()=>{
  it('shows the picked customer, All customers by default, with the list closed',()=>{
    const {rerender}=render(<CustomerPicker customers={customers} value={null} onChange={vi.fn()}/>);
    expect(screen.getByText('All customers')).toBeInTheDocument();
    expect(box()).toHaveAttribute('aria-expanded','false');
    expect(screen.queryByRole('listbox')).toBeNull();
    rerender(<CustomerPicker customers={customers} value="was" onChange={vi.fn()}/>);
    expect(screen.getByText('Wasatch Mechanical Contractors')).toBeInTheDocument();
  });

  it('opens on focus with All customers first, every customer after it, and says it shows the first 5',()=>{
    render(<CustomerPicker customers={customers} value={null} onChange={vi.fn()}/>);
    fireEvent.focus(box());
    expect(box()).toHaveAttribute('aria-expanded','true');
    expect(PICKER_VISIBLE_ROWS).toBe(5);
    expect(options().map(o=>o.textContent)).toEqual(['All customers',...customers.map(c=>`${c.name}${c.account_number}`)]);
    expect(options()[0]).toHaveAttribute('aria-selected','true');
    expect(screen.getByText(`Showing 5 of ${customers.length+1}. Scroll to see more or type to search.`)).toBeInTheDocument();
  });

  it('narrows the list as you type, by name or account number, and counts the matches',()=>{
    render(<CustomerPicker customers={customers} value={null} onChange={vi.fn()}/>);
    fireEvent.focus(box());
    fireEvent.change(box(),{target:{value:'Wasat'}});
    expect(options().map(o=>o.textContent)).toEqual(['Wasatch Mechanical ContractorsWAS-1142','Wasatch Valley RoofingWVR-5520']);
    expect(screen.getByText('2 matches')).toBeInTheDocument();
    fireEvent.change(box(),{target:{value:'wvr-55'}});
    expect(options().map(o=>o.textContent)).toEqual(['Wasatch Valley RoofingWVR-5520']);
    expect(screen.getByText('1 match')).toBeInTheDocument();
    fireEvent.change(box(),{target:{value:'zzz'}});
    expect(within(list()).queryAllByRole('option')).toEqual([]);
    expect(screen.getByText('0 matches')).toBeInTheDocument();
  });

  it('picks with the keyboard or a click, closes, and clears the search',()=>{
    const onChange=vi.fn();
    render(<CustomerPicker customers={customers} value={null} onChange={onChange}/>);
    fireEvent.focus(box());
    fireEvent.change(box(),{target:{value:'wasatch'}});
    fireEvent.keyDown(box(),{key:'ArrowDown'});
    expect(options()[1]).toHaveAttribute('aria-selected','true');
    fireEvent.keyDown(box(),{key:'Enter'});
    expect(onChange).toHaveBeenLastCalledWith('wvr');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect((box() as HTMLInputElement).value).toBe('');
    fireEvent.focus(box());
    fireEvent.mouseDown(within(list()).getByRole('option',{name:/^All customers/}));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('closes on Escape without picking',()=>{
    const onChange=vi.fn();
    render(<CustomerPicker customers={customers} value={null} onChange={onChange}/>);
    fireEvent.focus(box());
    fireEvent.keyDown(box(),{key:'Escape'});
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  // A rep's picker (plan U3; C_RQB1): "All my customers", and a summary line naming how many are theirs.
  it("takes the first row's words and the summary line from the page",()=>{
    const own=customers.slice(9);
    render(<CustomerPicker customers={own} value={null} onChange={vi.fn()} allLabel="All my customers"
      summary={n=>`Your ${n} customers. Type to search.`}/>);
    expect(screen.getByText('All my customers')).toBeInTheDocument();
    expect(box()).toHaveAccessibleName('Customer, All my customers');
    fireEvent.focus(box());
    expect(options().map(o=>o.textContent)).toEqual(['All my customers','Wasatch Mechanical ContractorsWAS-1142','Wasatch Valley RoofingWVR-5520']);
    expect(screen.getByText('Your 2 customers. Type to search.')).toBeInTheDocument();
    // Typing still counts the matches.
    fireEvent.change(box(),{target:{value:'roof'}});
    expect(screen.getByText('1 match')).toBeInTheDocument();
  });
});
