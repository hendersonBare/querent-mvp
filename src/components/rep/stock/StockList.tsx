'use client';
import {useMemo,useState} from 'react';
import Link from 'next/link';
import {DataTable,FilterButton,FilterCheckbox,FilterField,FilterGroup,FilterInput,FilterPair,FilterSpacer,type DataColumn,type TablePrefs} from '@/components/ui';
import type {AddToQuoteTarget} from '@/server/rep/add-to-quote';
import type {ItemList,ItemRow} from '@/server/rep/reference';
import {RepPageHeader} from '../RepPage';
import {SearchBox} from '../reference/controls';
import {NO_STOCK_FILTERS,STOCK_ONLY,filterItems,searchItems,stockFilterCount,stockSummary,type StockFilters} from '../reference/filters';
import {count,money} from '../reference/format';
import s from '../reference/Records.module.css';
import {AddToQuoteDialog} from './AddToQuote';

// Stock (plan U5, decision 46: was Items; C_STBase, C_ST1, C_ST3): the catalog with list price, category
// and stock at each branch, read-only, the same for every rep. Search narrows by SKU or name; Filter
// (which replaces the old category dropdown) by category, branch stock, Only show and the list price
// range. Each row's "Add to quote" opens the dialog (./AddToQuote).
//
// No frame (docs/plans/status.md): the applied state shows the Filter button's count only; "Low stock"
// means less than one full case at some branch (to ask).

export const STOCK_TABLE='stock';
/** C_STBase: nine items, then "Show 53 more items". */
const PAGE_SIZE=9;
/** C_ST1 draws its field boxes white (decision 55). */
const FILLED={background:'var(--q-card)'};

const toggle=<T,>(list:readonly T[],value:T,on:boolean)=>on?[...list,value]:list.filter(v=>v!==value);
/** "SLC, Ogden and Provo". */
const andList=(names:string[])=>names.length>1?`${names.slice(0,-1).join(', ')} and ${names.at(-1)}`:names[0]??'';

function columns(branches:ItemList['branches']):DataColumn<ItemRow>[]{
  return [
    {id:'item',label:'Item',track:'minmax(250px, 3fr)',alwaysShown:true,render:i=><>
      <Link className={s.desc} href={`/rep/stock/${encodeURIComponent(i.sku)}`}>{i.description}</Link>
      <div className={s.sub}><span className={s.mono}>{i.sku}</span>{`, ${i.pack}`}</div>
    </>},
    {id:'category',label:'Category',track:'1.1fr',render:i=><div>{i.category_name}</div>},
    {id:'list_price',label:'List price',track:'0.9fr',align:'right',render:i=><div className={s.balance}>{money(i.list_price)}</div>},
    ...branches.map(b=>({id:`branch-${b.id}`,label:b.code,track:'0.6fr',align:'right' as const,
      render:(i:ItemRow)=><div className={s.num}>{i.stock.find(x=>x.branch_id===b.id)?.available??0}</div>})),
    {id:'total',label:'Total',track:'0.7fr',align:'right',render:i=><div className={s.strong}>{i.total_available}</div>},
  ];
}

export function StockList({list,category,targets,initialPrefs=null}:{list:ItemList;
  /** The category the link names (?category=, the old Items links), or null. */
  category:string|null;
  /** The signed-in rep's own drafts, for Add to quote. */
  targets:AddToQuoteTarget[];initialPrefs?:TablePrefs|null}){
  const [query,setQuery]=useState('');
  const [filters,setFilters]=useState<StockFilters>(()=>list.categories.some(c=>c.id===category)?{...NO_STOCK_FILTERS,categories:[category!]}:NO_STOCK_FILTERS);
  const [adding,setAdding]=useState<ItemRow|null>(null);
  const highest=useMemo(()=>Math.max(0,...list.items.map(i=>i.list_price)),[list.items]);
  const cols=useMemo(()=>columns(list.branches),[list.branches]);
  const shown=filterItems(searchItems(list.items,query),filters);
  const where=andList(list.branches.map(b=>b.code));
  return <>
    <RepPageHeader title="Stock">
      <SearchBox label="Search SKU or item name" value={query} onChange={setQuery} width={340}/>
      <FilterButton<StockFilters> title="Filter stock" width={400} actionsGap={10} value={filters} empty={NO_STOCK_FILTERS} count={stockFilterCount(filters)} onApply={setFilters}
        description={stockSummary(list.items.length,list.categories.length)}>
        {(draft,set)=><>
          <FilterGroup label="Category" labelMargin="6px 0 2px">
            {list.categories.map(c=><FilterCheckbox key={c.id} label={c.name} count={c.count} checked={draft.categories.includes(c.id)}
              onChange={on=>set({...draft,categories:toggle(draft.categories,c.id,on)})}/>)}
          </FilterGroup>
          <FilterGroup label="In stock at" columns={3} gap="0 8px" labelMargin="6px 0 2px">
            {list.branches.map(b=><FilterCheckbox key={b.id} label={b.code} checked={draft.branches.includes(b.id)} onChange={on=>set({...draft,branches:toggle(draft.branches,b.id,on)})}/>)}
          </FilterGroup>
          <FilterGroup label="Only show" labelMargin="6px 0 2px">
            {STOCK_ONLY.map(o=><FilterCheckbox key={o.value} label={o.label} checked={draft.only.includes(o.value)} onChange={on=>set({...draft,only:toggle(draft.only,o.value,on)})}/>)}
          </FilterGroup>
          <FilterSpacer height={6}/>
          <FilterPair>
            <FilterField label="List price from">{id=><FilterInput style={FILLED} type="text" inputMode="decimal" aria-label="List price from" aria-describedby={id}
              placeholder={money(0)} value={draft.priceFrom} onChange={e=>set({...draft,priceFrom:e.target.value})}/>}</FilterField>
            <FilterField label="List price to">{id=><FilterInput style={FILLED} type="text" inputMode="decimal" aria-label="List price to" aria-describedby={id}
              placeholder={money(highest)} value={draft.priceTo} onChange={e=>set({...draft,priceTo:e.target.value})}/>}</FilterField>
          </FilterPair>
        </>}
      </FilterButton>
      <span className={s.count}>{`${count(shown.length,'item')}, stock at ${where}`}</span>
    </RepPageHeader>
    <div className="ui-root">
      <DataTable<ItemRow> className={s.table} tableId={STOCK_TABLE} label="Stock" columns={cols} rows={shown} rowKey={i=>i.id}
        layout="split" splitGap={12} minWidth={960} pageSize={PAGE_SIZE} initialPrefs={initialPrefs} pickerTrack="124px"
        rowEnd={i=><button type="button" className={s.addButton} onClick={()=>setAdding(i)}>Add to quote</button>}
        moreLabel={n=>`Show ${n} more ${n===1?'item':'items'}`} lessLabel="Show fewer items"/>
      {!shown.length&&<p className={s.empty}>No items match.</p>}
    </div>
    {adding&&<AddToQuoteDialog item={adding} targets={targets} onClose={()=>setAdding(null)}/>}
  </>;
}
