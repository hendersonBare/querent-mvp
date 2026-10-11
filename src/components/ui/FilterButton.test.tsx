import {fireEvent,render,screen,within} from '@testing-library/react';
import {describe,expect,it,vi} from 'vitest';
import {FilterButton,FilterCheckbox,FilterGroup,FilterSegmented} from './FilterButton';

// FilterButton and its panel (plan U0; frames C_QOB2, C_CU1, C_CU2, C_AN4): the panel edits a draft
// of the applied filters. "Apply filters" applies the draft and closes; "Clear all" empties the draft;
// closing without applying drops the edits. The count badge shows while any filter is applied.

interface Filters {statuses:string[];view:string}
const EMPTY:Filters={statuses:[],view:'org'};
const STATUSES=['Draft ready','Sent','Accepted'];

function Panel({value=EMPTY,count=0,onApply=vi.fn()}:{value?:Filters;count?:number;onApply?:(v:Filters)=>void}){
  return <FilterButton<Filters> title="Filter quotes" value={value} empty={EMPTY} count={count} onApply={onApply}>
    {(draft,set)=><>
      <FilterGroup label="Status" columns={2}>
        {STATUSES.map(s=><FilterCheckbox key={s} label={s} checked={draft.statuses.includes(s)}
          onChange={on=>set({...draft,statuses:on?[...draft.statuses,s]:draft.statuses.filter(x=>x!==s)})}/>)}
      </FilterGroup>
      <FilterSegmented label="Break the numbers down by" value={draft.view} onChange={view=>set({...draft,view})}
        options={[{value:'org',label:'Whole organization'},{value:'rep',label:'Rep'}]}/>
    </>}
  </FilterButton>;
}
const filterButton=()=>screen.getByRole('button',{name:/^Filter/});
const panel=()=>screen.getByRole('dialog',{name:'Filter quotes'});

describe('FilterButton',()=>{
  it('opens a panel titled with the page\'s filter, and closes on Escape',()=>{
    render(<Panel/>);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(filterButton()).toHaveAttribute('aria-expanded','false');
    fireEvent.click(filterButton());
    expect(filterButton()).toHaveAttribute('aria-expanded','true');
    expect(within(panel()).getByText('Filter quotes')).toBeInTheDocument();
    expect(within(panel()).getByText('Status')).toBeInTheDocument();
    expect(within(panel()).getAllByRole('checkbox').map(c=>(c as HTMLInputElement).checked)).toEqual([false,false,false]);
    fireEvent.keyDown(panel(),{key:'Escape'});
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('applies the draft and closes on Apply filters',()=>{
    const onApply=vi.fn();
    render(<Panel onApply={onApply}/>);
    fireEvent.click(filterButton());
    fireEvent.click(within(panel()).getByRole('checkbox',{name:'Sent'}));
    fireEvent.click(within(panel()).getByRole('radio',{name:'Rep'}));
    expect(within(panel()).getByRole('radio',{name:'Rep'})).toHaveAttribute('aria-checked','true');
    expect(onApply).not.toHaveBeenCalled();
    fireEvent.click(within(panel()).getByRole('button',{name:'Apply filters'}));
    expect(onApply).toHaveBeenCalledWith({statuses:['Sent'],view:'rep'});
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('empties the draft on Clear all without applying, then Apply applies the empty filters',()=>{
    const onApply=vi.fn();
    render(<Panel value={{statuses:['Draft ready','Accepted'],view:'rep'}} count={3} onApply={onApply}/>);
    fireEvent.click(filterButton());
    expect(within(panel()).getByRole('checkbox',{name:'Accepted'})).toBeChecked();
    fireEvent.click(within(panel()).getByRole('button',{name:'Clear all'}));
    expect(within(panel()).getAllByRole('checkbox').some(c=>(c as HTMLInputElement).checked)).toBe(false);
    expect(within(panel()).getByRole('radio',{name:'Whole organization'})).toHaveAttribute('aria-checked','true');
    expect(onApply).not.toHaveBeenCalled();
    fireEvent.click(within(panel()).getByRole('button',{name:'Apply filters'}));
    expect(onApply).toHaveBeenCalledWith(EMPTY);
  });

  it('drops unapplied edits when the panel closes, and starts again from the applied filters',()=>{
    const onApply=vi.fn();
    render(<Panel value={{statuses:['Accepted'],view:'org'}} count={1} onApply={onApply}/>);
    fireEvent.click(filterButton());
    fireEvent.click(within(panel()).getByRole('checkbox',{name:'Sent'}));
    fireEvent.click(filterButton());
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(filterButton());
    expect(within(panel()).getByRole('checkbox',{name:'Sent'})).not.toBeChecked();
    expect(within(panel()).getByRole('checkbox',{name:'Accepted'})).toBeChecked();
    expect(onApply).not.toHaveBeenCalled();
  });

  it('shows the count badge only while filters are applied',()=>{
    const {rerender}=render(<Panel count={0}/>);
    expect(filterButton()).toHaveTextContent(/^Filter$/);
    expect(filterButton()).toHaveAccessibleName('Filter');
    rerender(<Panel count={2}/>);
    expect(filterButton()).toHaveTextContent(/^Filter2$/);
    expect(filterButton()).toHaveAccessibleName('Filter, 2 applied');
  });
});
