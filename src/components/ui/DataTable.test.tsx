import {act,fireEvent,render,screen,within} from '@testing-library/react';
import {describe,expect,it,vi} from 'vitest';
import {DataTable,type DataColumn} from './DataTable';

// DataTable (plan U0; frames C_QOTable, C_QOT2 columns picker, C_QOT6 reorder, C_QOT5 show more):
// gray header with a "::" handle on every column, the columns picker at the end of the header row,
// drag or Alt+Arrow to reorder, about one screen of rows and then "Show N more".

interface Row {id:string;customer:string;status:string;total:string;margin:string;rep:string}
const ROWS:Row[]=Array.from({length:31},(_,i)=>({id:`Q-${24800+i}`,customer:`Customer ${i}`,status:i%2?'Sent':'Accepted',total:`$${i}.00`,margin:`${30+i%9}.0%`,rep:'Mara Jensen'}));
const COLUMNS:DataColumn<Row>[]=[
  {id:'quote',label:'Quote',track:'1fr',alwaysShown:true,render:r=>r.id},
  {id:'customer',label:'Customer',track:'2.2fr',render:r=>r.customer},
  {id:'status',label:'Status',track:'1.5fr',render:r=>r.status},
  {id:'total',label:'Total',track:'1fr',align:'right',render:r=>r.total},
  {id:'margin',label:'Margin',track:'0.9fr',align:'right',render:r=>r.margin},
  {id:'rep',label:'Rep',track:'1fr',hiddenByDefault:true,render:r=>r.rep},
];

function renderTable(props:Partial<Parameters<typeof DataTable<Row>>[0]>={}){
  const onPrefsChange=vi.fn();
  const view=render(<DataTable<Row> tableId="quotes" label="Quotes" columns={COLUMNS} rows={ROWS} rowKey={r=>r.id} pageSize={13}
    moreLabel={n=>`Show ${n} more quotes`} lessLabel="Show fewer quotes" onPrefsChange={onPrefsChange} {...props}/>);
  return {...view,onPrefsChange};
}
const headers=()=>screen.getAllByRole('columnheader').map(h=>h.textContent);
const bodyRows=()=>screen.getAllByRole('row').slice(1);
const picker=()=>screen.getByRole('dialog',{name:'Choose columns'});

describe('DataTable',()=>{
  it('draws a header cell with a "::" handle for every shown column, in order, and the rows under them',()=>{
    renderTable();
    expect(headers()).toEqual([':: Quote',':: Customer',':: Status',':: Total',':: Margin']);
    expect(screen.getByRole('button',{name:'Choose columns'})).toBeInTheDocument();
    expect(within(bodyRows()[0]).getAllByRole('cell').map(c=>c.textContent)).toEqual(['Q-24800','Customer 0','Accepted','$0.00','30.0%']);
  });

  it('shows the first page, then every row after "Show N more", and back with "Show fewer"',()=>{
    renderTable();
    expect(bodyRows()).toHaveLength(13);
    fireEvent.click(screen.getByRole('button',{name:'Show 18 more quotes'}));
    expect(bodyRows()).toHaveLength(31);
    fireEvent.click(screen.getByRole('button',{name:'Show fewer quotes'}));
    expect(bodyRows()).toHaveLength(13);
  });

  it('has no Show more button when every row fits on the first page',()=>{
    renderTable({rows:ROWS.slice(0,13)});
    expect(screen.queryByRole('button',{name:/^Show /})).toBeNull();
  });

  it('hides a column from the columns picker and restores it, saving the prefs each time',()=>{
    const {onPrefsChange}=renderTable();
    fireEvent.click(screen.getByRole('button',{name:'Choose columns'}));
    expect(within(picker()).getAllByRole('checkbox').map(c=>[c.getAttribute('aria-label'),(c as HTMLInputElement).checked]))
      .toEqual([['Quote',true],['Customer',true],['Status',true],['Total',true],['Margin',true],['Rep',false]]);
    expect(within(picker()).getByRole('checkbox',{name:'Quote'})).toBeDisabled();
    expect(within(picker()).getByRole('checkbox',{name:'Quote'})).toHaveAccessibleDescription('Always shown');
    fireEvent.click(within(picker()).getByRole('checkbox',{name:'Margin'}));
    expect(headers()).toEqual([':: Quote',':: Customer',':: Status',':: Total']);
    expect(within(bodyRows()[0]).getAllByRole('cell')).toHaveLength(4);
    expect(onPrefsChange).toHaveBeenLastCalledWith({column_order:['quote','customer','status','total','margin','rep'],hidden_columns:['margin','rep']});
    fireEvent.click(within(picker()).getByRole('checkbox',{name:'Margin'}));
    fireEvent.click(within(picker()).getByRole('checkbox',{name:'Rep'}));
    expect(headers()).toEqual([':: Quote',':: Customer',':: Status',':: Total',':: Margin',':: Rep']);
    expect(onPrefsChange).toHaveBeenLastCalledWith({column_order:['quote','customer','status','total','margin','rep'],hidden_columns:[]});
    fireEvent.click(within(picker()).getByRole('button',{name:'Reset to default'}));
    expect(headers()).toEqual([':: Quote',':: Customer',':: Status',':: Total',':: Margin']);
    expect(onPrefsChange).toHaveBeenLastCalledWith({column_order:['quote','customer','status','total','margin','rep'],hidden_columns:['rep']});
    fireEvent.click(within(picker()).getByRole('button',{name:'Done'}));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('moves a column with Alt+Arrow on its header, and from the columns picker with Alt+Up and Alt+Down',()=>{
    const {onPrefsChange}=renderTable();
    const status=screen.getByRole('columnheader',{name:/Status/});
    status.focus();
    fireEvent.keyDown(status,{key:'ArrowLeft',altKey:true});
    expect(headers()).toEqual([':: Quote',':: Status',':: Customer',':: Total',':: Margin']);
    expect(onPrefsChange).toHaveBeenLastCalledWith({column_order:['quote','status','customer','total','margin','rep'],hidden_columns:['rep']});
    expect(document.activeElement).toHaveTextContent(':: Status');
    expect(screen.getByRole('status')).toHaveTextContent('Status moved to position 2 of 5.');
    fireEvent.keyDown(screen.getByRole('columnheader',{name:/Status/}),{key:'ArrowLeft'});
    expect(headers()[1]).toBe(':: Status');
    fireEvent.click(screen.getByRole('button',{name:'Choose columns'}));
    fireEvent.keyDown(within(picker()).getByRole('checkbox',{name:'Total'}),{key:'ArrowDown',altKey:true});
    expect(headers()).toEqual([':: Quote',':: Status',':: Customer',':: Margin',':: Total']);
  });

  it('reorders by dragging a header onto another',()=>{
    renderTable();
    const dataTransfer={setData:vi.fn(),getData:vi.fn(),effectAllowed:'',dropEffect:''};
    act(()=>{fireEvent.dragStart(screen.getByRole('columnheader',{name:/Total/}),{dataTransfer});});
    fireEvent.dragOver(screen.getByRole('columnheader',{name:/Customer/}),{dataTransfer});
    fireEvent.drop(screen.getByRole('columnheader',{name:/Customer/}),{dataTransfer});
    expect(headers()).toEqual([':: Quote',':: Total',':: Customer',':: Status',':: Margin']);
  });

  it('starts from the user\'s saved prefs',()=>{
    renderTable({initialPrefs:{column_order:['customer','quote','status','total','margin','rep'],hidden_columns:['total','rep']}});
    expect(headers()).toEqual([':: Customer',':: Quote',':: Status',':: Margin']);
  });
  it('takes a wider trailing track that holds a per-row action under the columns picker (plan U5; C_STBase 124px "Add to quote")',()=>{
    const onAdd=vi.fn();
    const {container}=renderTable({pickerTrack:'124px',rowEnd:r=><button type="button" onClick={()=>onAdd(r.id)}>Add to quote</button>});
    const head=screen.getAllByRole('row')[0] as HTMLElement;
    expect(head.style.gridTemplateColumns).toBe('1fr 2.2fr 1.5fr 1fr 0.9fr 124px');
    expect((bodyRows()[0] as HTMLElement).style.gridTemplateColumns).toBe('1fr 2.2fr 1.5fr 1fr 0.9fr 124px');
    // The action sits in its own cell after the data cells; the header keeps the picker there.
    expect(within(bodyRows()[0]).getAllByRole('cell').map(c=>c.textContent)).toEqual(['Q-24800','Customer 0','Accepted','$0.00','30.0%','Add to quote']);
    fireEvent.click(within(bodyRows()[1]).getByRole('button',{name:'Add to quote'}));
    expect(onAdd).toHaveBeenCalledWith('Q-24801');
    expect(container.querySelectorAll('button[aria-label="Choose columns"]')).toHaveLength(1);
  });

  it('keeps the 28px picker track and an empty trailing cell by default (C_CUBase)',()=>{
    renderTable();
    expect((screen.getAllByRole('row')[0] as HTMLElement).style.gridTemplateColumns).toBe('1fr 2.2fr 1.5fr 1fr 0.9fr 28px');
    expect(within(bodyRows()[0]).getAllByRole('cell')).toHaveLength(5);
  });
  it('aligns a left column\'s header to the left, as C_CUBase draws it, and leaves its cells alone',()=>{
    renderTable({columns:COLUMNS.map(c=>c.id==='customer'?{...c,align:'left' as const}:c)});
    const head=screen.getByRole('columnheader',{name:'Customer'});
    expect(head.className).toMatch(/left/);
    expect(within(bodyRows()[0]).getAllByRole('cell')[1].className).toBe('');
    expect(screen.getByRole('columnheader',{name:'Quote'}).className).not.toMatch(/left/);
  });
});
