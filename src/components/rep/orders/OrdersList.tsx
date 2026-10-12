'use client';
import {useMemo,useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import type {OrderListRow} from '@/domain';
import {
  CustomerPicker,DataTable,FilterButton,FilterCheckbox,FilterField,FilterGroup,FilterInput,FilterPair,FilterSpacer,type DataColumn,type PickerCustomer,type TablePrefs,
} from '@/components/ui';
import {RepPageHeader} from '../RepPage';
import {withCustomer} from '../scope';
import {FULFILLMENT_OPTIONS,NO_ORDER_FILTERS,filterOrders,orderFilterCount,orderRepOptions,orderStatusOptions,type OrderFilters} from '../reference/filters';
import {ORDER_STATUS,count,day,fulfillment,money,orderRefs} from '../reference/format';
import {OrderStatusText} from '../reference/parts';
import s from '../reference/Records.module.css';

// Orders (plan U5; C_ORBase, C_OR1): orders from the ERP, newest first, read-only: the rep's own
// customers' (every customer's for the manager, task U1). The customer picker loads the page for one
// customer (its own ?customer=); Filter narrows by rep (manager only), status, fulfillment, branch and
// the ordered range. About one screen of rows shows first, then "Show N more orders".
//
// No frame (docs/plans/status.md): the applied state shows the Filter button's count only (C_CU2's chip
// row is drawn for Customers); the Open status; a rep's Orders (the manager's layout with the rep's own
// data, without the Rep column and filter).

export const ORDERS_TABLE='orders';
/** C_ORBase: ten orders, then "Show 13 more orders". */
const PAGE_SIZE=10;
/** C_OR1 draws its field boxes white (decision 55). */
const FILLED={background:'var(--q-card)'};

const toggle=<T,>(list:readonly T[],value:T,on:boolean)=>on?[...list,value]:list.filter(v=>v!==value);

function columns(manager:boolean):DataColumn<OrderListRow>[]{
  const all:(DataColumn<OrderListRow>|false)[]=[
    {id:'order',label:'Order',track:'minmax(170px, 1.5fr)',alwaysShown:true,render:o=>{
      const refs=orderRefs(o.po_number,o.quote_number);
      return <><Link className={s.name} href={`/rep/orders/${encodeURIComponent(o.order_number)}`}>{o.order_number}</Link>{refs&&<div className={s.sub}>{refs}</div>}</>;
    }},
    {id:'customer',label:'Customer',track:'minmax(190px, 2fr)',render:o=><><div className={s.customerName}>{o.customer_name}</div><div className={s.code}>{o.account_number}</div></>},
    manager&&{id:'rep',label:'Rep',track:'1.2fr',render:o=><div className={s.semibold}>{o.rep_name??<span className={s.muted}>Unassigned</span>}</div>},
    {id:'ordered',label:'Ordered',track:'1.1fr',render:o=><div>{day(o.order_date)}</div>},
    {id:'fulfillment',label:'Fulfillment',track:'1.2fr',render:o=><div>{fulfillment(o.fulfillment,o.branch_code)}</div>},
    {id:'status',label:'Status',track:'0.8fr',render:o=><div><OrderStatusText status={o.status}/></div>},
    {id:'lines',label:'Lines',track:'0.5fr',align:'right',render:o=><div className={s.num}>{o.line_count}</div>},
    {id:'total',label:'Total',track:'0.9fr',align:'right',render:o=><div className={s.strong}>{money(o.total)}</div>},
  ];
  return all.filter((c):c is DataColumn<OrderListRow>=>!!c);
}

export function OrdersList({rows,customers,customerId,branches,manager,initialPrefs=null}:{
  rows:OrderListRow[];
  /** The customers the signed-in rep may read, for the picker. */
  customers:PickerCustomer[];
  /** The page's own ?customer= as the server read it, or null for All customers. */
  customerId:string|null;
  branches:{id:string;code:string}[];
  /** The manager sees the Rep column and the Rep filter (C_ORBase). */
  manager:boolean;initialPrefs?:TablePrefs|null;
}){
  const router=useRouter();
  const [filters,setFilters]=useState<OrderFilters>(NO_ORDER_FILTERS);
  const reps=useMemo(()=>orderRepOptions(rows),[rows]);
  const statuses=useMemo(()=>orderStatusOptions(rows),[rows]);
  const applied=manager?filters:{...filters,reps:[]};
  const shown=filterOrders(rows,applied);
  const cols=useMemo(()=>columns(manager),[manager]);
  const picked=customers.find(c=>c.id===customerId);
  return <>
    <RepPageHeader title="Orders">
      <CustomerPicker customers={customers} value={customerId} onChange={id=>router.push(withCustomer('/rep/orders',id))}/>
      <FilterButton<OrderFilters> title="Filter orders" width={400} titleGap={2} actionsGap={10} value={applied} empty={NO_ORDER_FILTERS} count={orderFilterCount(applied)} onApply={setFilters}>
        {(draft,set)=><>
          {manager&&<FilterGroup label="Rep" columns={3} gap="0 8px" labelMargin="6px 0 2px">
            {reps.map(r=><FilterCheckbox key={r.id} label={r.name} checked={draft.reps.includes(r.id)} onChange={on=>set({...draft,reps:toggle(draft.reps,r.id,on)})}/>)}
          </FilterGroup>}
          <FilterGroup label="Status" columns={2} gap="0 8px" labelMargin="6px 0 2px">
            {statuses.map(st=><FilterCheckbox key={st} label={ORDER_STATUS[st]} checked={draft.statuses.includes(st)} onChange={on=>set({...draft,statuses:toggle(draft.statuses,st,on)})}/>)}
          </FilterGroup>
          <FilterGroup label="Fulfillment" columns={2} gap="0 8px" labelMargin="6px 0 2px">
            {FULFILLMENT_OPTIONS.map(f=><FilterCheckbox key={f.value} label={f.label} checked={draft.fulfillment.includes(f.value)} onChange={on=>set({...draft,fulfillment:toggle(draft.fulfillment,f.value,on)})}/>)}
          </FilterGroup>
          <FilterGroup label="Branch" columns={3} gap="0 8px" labelMargin="6px 0 2px">
            {branches.map(b=><FilterCheckbox key={b.id} label={b.code} checked={draft.branches.includes(b.id)} onChange={on=>set({...draft,branches:toggle(draft.branches,b.id,on)})}/>)}
          </FilterGroup>
          <FilterSpacer height={6}/>
          <FilterPair>
            <FilterField label="Ordered from">{id=><FilterInput style={FILLED} type="date" aria-label="Ordered from" aria-describedby={id} value={draft.from} onChange={e=>set({...draft,from:e.target.value})}/>}</FilterField>
            <FilterField label="Ordered to">{id=><FilterInput style={FILLED} type="date" aria-label="Ordered to" aria-describedby={id} value={draft.to} onChange={e=>set({...draft,to:e.target.value})}/>}</FilterField>
          </FilterPair>
        </>}
      </FilterButton>
      <span className={s.count}>{count(shown.length,'order')}</span>
    </RepPageHeader>
    <div className="ui-root">
      <DataTable<OrderListRow> className={s.table} tableId={ORDERS_TABLE} label="Orders" columns={cols} rows={shown} rowKey={o=>o.id}
        layout="split" splitGap={12} minWidth={1040} pageSize={PAGE_SIZE} initialPrefs={initialPrefs}
        moreLabel={n=>`Show ${n} more ${n===1?'order':'orders'}`} lessLabel="Show fewer orders"/>
      {!shown.length&&<p className={s.empty}>{rows.length?'No orders match.':picked?`No orders for ${picked.name} yet.`:'No orders yet.'}</p>}
    </div>
  </>;
}
