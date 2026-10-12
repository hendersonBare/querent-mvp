'use client';
import {useRef,useState,type CSSProperties,type ReactNode} from 'react';
import {ColumnsPicker} from '@/components/ui/ColumnsPicker';
import {Icon} from '@/components/ui/Icon';
import {cx} from '@/components/ui/cx';
import {defaultPrefs,moveItem,resolveColumns,saveTablePrefs,type TablePrefs} from '@/components/ui/table-prefs';
import {dropSlot,useReorder} from '@/components/ui/useReorder';
import s from './Analytics.module.css';

// The Analytics tables (C_AN3 weeks, C_AN6 leaderboard, C_AN7 decline reasons, C_AN8 untouched quotes,
// C_AN2 queries by category): a gray header with a "::" on every column, rows on a grid. Each frame
// sets its own paddings, gaps and box, so the table takes them as classes. Like the U0 DataTable, a
// header moves by dragging it onto another or with Alt+Left / Alt+Right, and the order (and, where the
// frame draws the columns picker, the hidden columns) is the user's own: saved per table
// (PUT /api/rep/table-prefs) and read back by the page. Column ids are the API's "a-z0-9_-".

export interface GridColumn<Row> {
  id:string;label:string;
  /** The grid track: a fraction for fluid columns, px for fixed ones. */
  track:string;
  /** right: numbers; left: written out (C_AN6 and C_AN8 set text-align: left on the first column). */
  align?:'left'|'right';
  /** The row's name (its rowheader). */
  header?:boolean;
  /** The cell's own look where the frame styles the cell itself (C_AN3's bold week, C_AN7's bold reason). */
  cellClass?:string;
  alwaysShown?:boolean;
  hiddenByDefault?:boolean;
  render:(row:Row)=>ReactNode;
}

export interface GridTableProps<Row> {
  tableId:string;label:string;
  columns:readonly GridColumn<Row>[];
  rows:readonly Row[];
  rowKey:(row:Row)=>string;
  gap:number;
  /** The columns picker at the end of the header row (C_AN3, C_AN6). */
  picker?:boolean;
  /** The table's own box (C_AN3, C_AN7, C_AN8 draw a hairline box with radius 10). */
  className?:string;
  /** The table's place in its parent's layout (a flex item). */
  wrapClass?:string;
  style?:CSSProperties;
  headClass?:string;
  rowClass?:(row:Row)=>string|undefined;
  /** A row above the header (C_AN6's "Open" over three columns), given the grid template and the visible column ids. */
  above?:(grid:CSSProperties,visible:string[])=>ReactNode;
  /** Rows after the body (a totals row), drawn with the same columns. */
  after?:readonly Row[];
  afterClass?:(row:Row)=>string|undefined;
  /** How the after rows draw a column, where it differs (C_AN8's totals are plain text). By id. */
  afterColumns?:readonly GridColumn<Row>[];
  /** "Show N more": rows before it, and its words. */
  pageSize?:number;
  moreLabel?:(remaining:number)=>string;
  lessLabel?:string;
  foot?:ReactNode;
  initialPrefs?:TablePrefs|null;
}

const PICKER_TRACK='28px';

export function GridTable<Row>({tableId,label,columns,rows,rowKey,gap,picker=false,className,wrapClass,style,headClass,rowClass,above,after=[],afterClass,afterColumns=[],
  pageSize,moreLabel,lessLabel='Show fewer',foot,initialPrefs=null}:GridTableProps<Row>){
  const [prefs,setPrefs]=useState<TablePrefs|null>(initialPrefs);
  const [expanded,setExpanded]=useState(false);
  const [picking,setPicking]=useState(false);
  const [pickerAt,setPickerAt]=useState<CSSProperties>({});
  const [announcement,setAnnouncement]=useState('');
  const wrap=useRef<HTMLDivElement>(null);
  const pickerCell=useRef<HTMLDivElement>(null);
  const byId=new Map(columns.map(c=>[c.id,c]));
  const {order,hidden}=resolveColumns(columns,prefs);
  const shownHidden=picker?hidden:[];
  const visible=order.filter(id=>!shownHidden.includes(id)).map(id=>byId.get(id)!);
  const visibleIds=visible.map(c=>c.id);
  const grid:CSSProperties={gridTemplateColumns:[...visible.map(c=>c.track),...(picker?[PICKER_TRACK]:[])].join(' '),gap};

  function update(next:TablePrefs){setPrefs(next);void saveTablePrefs(tableId,next);}
  function moveVisible(from:number,to:number){
    const id=visibleIds[from],target=visibleIds[to];
    update({column_order:moveItem(order,order.indexOf(id),order.indexOf(target)),hidden_columns:shownHidden});
    setAnnouncement(`${byId.get(id)!.label} moved to position ${to+1} of ${visibleIds.length}.`);
  }
  const header=useReorder({ids:visibleIds,onMove:moveVisible,orientation:'horizontal'});
  const slot=dropSlot(visibleIds,header);
  function openPicker(){
    if(picking){setPicking(false);return;}
    const box=wrap.current?.getBoundingClientRect(),cell=pickerCell.current?.getBoundingClientRect();
    if(box&&cell)setPickerAt({top:cell.bottom-box.top+13,right:box.right-cell.right-12});
    setPicking(true);
  }

  const align=(c:GridColumn<Row>)=>c.align==='right'?s.right:c.align==='left'?s.left:undefined;
  const afterById=new Map(afterColumns.map(c=>[c.id,c]));
  const line=(row:Row,extra?:string,isAfter=false)=><div key={rowKey(row)} role="row" className={cx(s.row,extra)} style={grid}>
    {visible.map(column=>{
      const c=isAfter?afterById.get(column.id)??column:column;
      return <div key={c.id} role={column.header?'rowheader':'cell'} className={cx(align(c),c.cellClass)}>{c.render(row)}</div>;
    })}
  </div>;
  const shown=pageSize&&!expanded?rows.slice(0,pageSize):rows;
  const remaining=pageSize?rows.length-pageSize:0;

  return <div ref={wrap} className={wrapClass} style={{position:'relative'}}>
    <div role="table" aria-label={label} className={className} style={style}>
      {above?.(grid,visibleIds)}
      <div role="row" className={cx(s.head,headClass)} style={grid}>
        {visible.map((c,i)=>{
          const drop=slot&&(slot.to<slot.from?(slot.to===0&&i===0?'before':i===slot.to-1?'after':null):(i===slot.to?'after':null));
          const {ref,...drag}=header.itemProps(c.id);
          return <div key={c.id} ref={ref} role="columnheader" tabIndex={0} aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight"
            className={cx(s.headCell,align(c),drop==='after'&&s.dropAfter,drop==='before'&&s.dropBefore)} {...drag}>{':: '}{c.label}</div>;
        })}
        {picker&&<div ref={pickerCell} className={s.pickerCell}>
          <button type="button" aria-label="Choose columns" aria-expanded={picking} aria-haspopup="dialog" className={s.columnsButton} onClick={openPicker}>
            <Icon name="columns" size={16}/>
          </button>
        </div>}
      </div>
      {shown.map(row=>line(row,rowClass?.(row)))}
      {after.map(row=>line(row,afterClass?.(row),true))}
      {remaining>0&&<div className={s.foot}>
        <button type="button" className={s.more} onClick={()=>setExpanded(!expanded)}>{expanded?lessLabel:moreLabel?.(remaining)}</button>
      </div>}
      {foot}
    </div>
    {picker&&<ColumnsPicker open={picking} onClose={()=>setPicking(false)} ignore={pickerCell} columns={columns} order={order} hidden={hidden} style={pickerAt}
      onToggle={(id,on)=>update({column_order:order,hidden_columns:on?hidden.filter(h=>h!==id):order.filter(o=>o===id||hidden.includes(o))})}
      onMove={(from,to)=>update({column_order:moveItem(order,from,to),hidden_columns:hidden})}
      onReset={()=>update(defaultPrefs(columns))}/>}
    <div role="status" className={s.hidden}>{announcement}</div>
  </div>;
}

/** A column id the prefs API accepts, from a group key ("team:Inside Sales" is "team-inside-sales"). */
export const columnId=(key:string)=>`g-${key.toLowerCase().replace(/[^a-z0-9_-]+/g,'-')}`.slice(0,40);
