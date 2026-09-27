import Link from 'next/link';
import type {ItemList} from '@/server/rep/reference';
import {RepPageHeader} from '../RepPage';
import {count,money} from '../reference/format';
import {Empty,hrefFor,pageStyles as page,referenceStyles as s,Stock,type Viewing} from '../reference/parts';

// Items (spec §4, task 3.8): Herrick's catalog with the list price, category and stock at each
// branch, read-only, filtered by category (?category=). The catalog is the same for every
// customer, so the "Viewing" picker doesn't narrow it; links keep it.

export const CATEGORY_PARAM='category';

export function ItemsList({list,viewing}:{list:ItemList;viewing:Viewing}){
  const total=list.categories.reduce((sum,c)=>sum+c.count,0);
  const shown=list.category?.name??'All categories';
  const branchNames=list.branches.map(b=>b.code);
  return <>
    <RepPageHeader title="Items" description={<>Herrick’s catalog · {count(total,'item')} · stock at {branchNames.slice(0,-1).join(', ')} and {branchNames.at(-1)}
      {viewing.customerId&&<> · the same for every customer</>}</>}/>
    <nav className={s.filters} aria-label="Filter by category">
      <Link href={hrefFor(viewing,'/rep/items')} aria-current={list.category?undefined:'page'}>All<span className={s.filterCount}>{total}</span></Link>
      {list.categories.map(c=><Link key={c.id} href={hrefFor(viewing,`/rep/items?${CATEGORY_PARAM}=${encodeURIComponent(c.id)}`)} aria-current={list.category?.id===c.id?'page':undefined}>
        {c.name}<span className={s.filterCount}>{c.count}</span>
      </Link>)}
    </nav>
    <section className={page.card} aria-label={`Items: ${shown}`}>
      {list.items.length?<div className={s.tableWrap}>
        <table className={s.table}>
          <caption>{shown}, with list price and stock at each branch</caption>
          <thead>
            <tr>
              <th scope="col">Item</th>
              <th scope="col" className={s.wide}>Category</th>
              <th scope="col" className={`${s.num} ${s.wide}`}>List price</th>
              {list.branches.map(b=><th key={b.id} scope="col" className={s.num}>{b.code}</th>)}
              <th scope="col" className={`${s.num} ${s.wide}`}>Total</th>
            </tr>
          </thead>
          <tbody>{list.items.map(item=><tr key={item.id}>
            <th scope="row">
              <Link className={s.desc} href={hrefFor(viewing,`/rep/items/${encodeURIComponent(item.sku)}`)}>{item.description}</Link>
              <span className={s.sub}><span className={s.sku}>{item.sku}</span> · {item.pack}</span>
              {/* Phones drop the List price column (mockup 08 keeps only the essentials), so the price rides under the item. */}
              <span className={`${s.sub} ${s.phoneOnly}`}>List {money(item.list_price)}</span>
            </th>
            <td className={s.wide}>{item.category_name}</td>
            <td className={`${s.num} ${s.strong} ${s.wide}`}>{money(item.list_price)}</td>
            {list.branches.map(b=>{const at=item.stock.find(x=>x.branch_id===b.id);return <td key={b.id} className={s.num}><Stock available={at?.available??0} onOrder={at?.on_order}/></td>;})}
            <td className={`${s.num} ${s.wide}`}>{item.total_available}</td>
          </tr>)}</tbody>
        </table>
      </div>:<Empty heading="No items in this category"/>}
    </section>
  </>;
}
