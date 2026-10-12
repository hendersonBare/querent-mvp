'use client';
import {useRef,useState,type CSSProperties,type ReactNode} from 'react';
import {ColumnsPicker} from './ColumnsPicker';
import {Icon} from './Icon';
import {ShowMoreButton} from './ShowMoreButton';
import s from './DataTable.module.css';
import {cx} from './cx';
import {defaultPrefs,moveItem,resolveColumns,saveTablePrefs,type TablePrefs} from './table-prefs';
import {dropSlot,useReorder} from './useReorder';

// DataTable (plan U0; frames C_QOTable, C_QOT2 columns picker, C_QOT5 show more, C_QOT6 reorder,
// C_CUBase split layout): a gray header row with a "::" handle on every column and the columns picker
// at its end. Drag a header onto another, or press Alt+Left / Alt+Right on a focused header, to move a
// column. About one screen of rows shows first, then "Show N more" shows the rest and "Show fewer" goes
// back. Column order and visibility are the user's own: they start from `initialPrefs` and every change
// is saved (PUT /api/rep/table-prefs) unless `onPrefsChange` takes it instead.

export interface DataColumn<Row> {
  id:string;
  label:string;
  /** The grid track: a fraction for fluid columns ("2.2fr"), px for fixed ones ("118px"). */
  track:string;
  /** right aligns the header and the cells; left sets the header's text-align to left, as frames with explicit alignment draw it (C_CUBase), and leaves the cells as they are. */
  align?:'left'|'right';
  alwaysShown?:boolean;
  hiddenByDefault?:boolean;
  render:(row:Row)=>ReactNode;
}

export interface DataTableProps<Row> {
  /** Stable id for the user's prefs ("quotes"). */
  tableId:string;
  /** The table's accessible name. */
  label:string;
  columns:readonly DataColumn<Row>[];
  rows:readonly Row[];
  rowKey:(row:Row)=>string;
  /** Rows shown before "Show N more" (about one screen). */
  pageSize:number;
  moreLabel:(remaining:number)=>string;
  lessLabel:string;
  /** card: one white card with the header inside (C_QOTable). split: the header bar above a white section (C_CUBase). */
  layout?:'card'|'split';
  /** The row divider: soft is C_QOTable's lighter line. */
  divider?:'default'|'soft';
  /** Gap between grid tracks (C_QOTable 16, C_TRBase 14). */
  gap?:number;
  /** Gap between the header bar and the section in the split layout (C_CUBase 14, C_ORBase 12). */
  splitGap?:number;
  /** Below this width the table scrolls sideways inside itself (C_QOTable 880). */
  minWidth?:number;
  initialPrefs?:TablePrefs|null;
  onPrefsChange?:(prefs:TablePrefs)=>void;
  onRowClick?:(row:Row)=>void;
  /** What the body shows with no rows (decision 52: one plain line), e.g. a <div> in the page's own style. */
  empty?:ReactNode;
  /** The last track, which holds the columns picker in the header (C_QOTable 28px; C_STBase 124px, wide enough for a row action). */
  pickerTrack?:string;
  /** A per-row control in that last track, under the columns picker (C_STBase "Add to quote"). */
  rowEnd?:(row:Row)=>ReactNode;
  className?:string;
  style?:CSSProperties;
}

const PICKER_TRACK='28px';

export function DataTable<Row>({tableId,label,columns,rows,rowKey,pageSize,moreLabel,lessLabel,layout='card',divider='default',gap=16,splitGap=14,
  minWidth,initialPrefs=null,onPrefsChange,onRowClick,empty,pickerTrack=PICKER_TRACK,rowEnd,className,style}:DataTableProps<Row>){
  const [prefs,setPrefs]=useState(()=>{const r=resolveColumns(columns,initialPrefs);return {column_order:r.order,hidden_columns:r.hidden};});
  const [expanded,setExpanded]=useState(false);
  const [picking,setPicking]=useState(false);
  const [pickerAt,setPickerAt]=useState<CSSProperties>({});
  const [announcement,setAnnouncement]=useState('');
  const wrap=useRef<HTMLDivElement>(null);
  const pickerCell=useRef<HTMLDivElement>(null);
  const byId=new Map(columns.map(c=>[c.id,c]));
  const {order,hidden}=resolveColumns(columns,prefs);
  const visible=order.filter(id=>!hidden.includes(id)).map(id=>byId.get(id)!);
  const visibleIds=visible.map(c=>c.id);
  const template=[...visible.map(c=>c.track),pickerTrack].join(' ');
  const grid:CSSProperties={gridTemplateColumns:template,gap};

  function update(next:TablePrefs){
    setPrefs(next);
    if(onPrefsChange)onPrefsChange(next);else void saveTablePrefs(tableId,next);
  }
  /** Moves a shown column to a shown neighbour's place, keeping hidden columns where they are. */
  function moveVisible(from:number,to:number){
    const id=visibleIds[from],target=visibleIds[to];
    const next=moveItem(order,order.indexOf(id),order.indexOf(target));
    update({column_order:next,hidden_columns:hidden});
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

  const shownRows=expanded?rows:rows.slice(0,pageSize);
  const remaining=rows.length-pageSize;
  const headRow=<div role="row" className={cx(s.head,layout==='split'&&s.splitHead)} style={grid}>
    {visible.map((column,i)=>{
      const lifted=header.dragging===column.id;
      const drop=slot&&(slot.to<slot.from?(slot.to===0&&i===0?'before':i===slot.to-1?'after':null):(i===slot.to?'after':null));
      const {ref,...drag}=header.itemProps(column.id);
      return <div key={column.id} ref={ref} role="columnheader" tabIndex={0} aria-label={column.label} aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight"
        data-drop={drop??undefined} className={cx(s.headCell,column.align==='right'&&s.right,column.align==='left'&&s.left,drop==='after'&&s.dropAfter,drop==='before'&&s.dropBefore)} {...drag}>
        {lifted?<span data-ui="lifted" className={s.lifted}>{':: '}{column.label}</span>:<>{':: '}{column.label}</>}
      </div>;
    })}
    <div ref={pickerCell} className={s.pickerCell}>
      <button type="button" aria-label="Choose columns" aria-expanded={picking} aria-haspopup="dialog" className={s.columnsButton} onClick={openPicker}>
        <Icon name="columns" size={16}/>
      </button>
    </div>
  </div>;
  const bodyRows=rows.length===0&&empty?empty:shownRows.map(row=><div key={rowKey(row)} role="row" className={cx(s.row,divider==='soft'&&s.soft,onRowClick&&s.clickable)} style={grid}
    onClick={onRowClick?()=>onRowClick(row):undefined}>
    {visible.map(column=><div key={column.id} role="cell" className={column.align==='right'?s.right:undefined}>{column.render(row)}</div>)}
    {rowEnd&&<div role="cell" className={s.rowEnd}>{rowEnd(row)}</div>}
  </div>);
  const foot=remaining>0&&<div className={cx(s.foot,divider==='soft'&&s.soft,layout==='card'?s.cardFoot:s.splitFoot)}>
    <ShowMoreButton onClick={()=>setExpanded(!expanded)}>{expanded?lessLabel:moreLabel(remaining)}</ShowMoreButton>
  </div>;

  return <div ref={wrap} className={cx(s.wrap,className)} style={style}>
    {layout==='card'
      ?<div role="table" aria-label={label} data-ui="table" className={s.card}><div className={s.scroll}><div style={{minWidth}}>{headRow}{bodyRows}{foot}</div></div></div>
      :<div className={s.scroll}><div role="table" aria-label={label} data-ui="table" className={s.splitInner} style={{minWidth,gap:splitGap}}>
        {headRow}<section className={s.section}>{bodyRows}{foot}</section>
      </div></div>}
    <ColumnsPicker open={picking} onClose={()=>setPicking(false)} ignore={pickerCell} columns={columns} order={order} hidden={hidden} style={pickerAt}
      onToggle={(id,shown)=>update({column_order:order,hidden_columns:shown?hidden.filter(h=>h!==id):order.filter(o=>o===id||hidden.includes(o))})}
      onMove={(from,to)=>update({column_order:moveItem(order,from,to),hidden_columns:hidden})}
      onReset={()=>update(defaultPrefs(columns))}/>
    <div role="status" className={s.hidden}>{announcement}</div>
  </div>;
}
