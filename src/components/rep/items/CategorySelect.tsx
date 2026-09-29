'use client';
import {useRouter} from 'next/navigation';
import {hrefFor,referenceStyles as s,type Viewing} from '../reference/parts';
import {CATEGORY_PARAM} from './params';

// The Items page's only category filter: a dropdown, All by default. Choosing a category loads
// /rep/items?category=<id> (keeping the "Viewing" customer), so the page stays server-rendered
// and a filtered list can still be linked to.

export const ALL_CATEGORIES='';

/** The Items URL for one category, or every category. */
export const itemsHref=(viewing:Pick<Viewing,'customerId'>,categoryId:string|null)=>
  hrefFor(viewing,categoryId?`/rep/items?${CATEGORY_PARAM}=${encodeURIComponent(categoryId)}`:'/rep/items');

export interface CategoryOption {id:string;name:string;count:number}

export function CategorySelect({categories,value,total,viewing}:{
  categories:readonly CategoryOption[];
  /** The category shown, or null for all. */
  value:string|null;
  total:number;
  viewing:Pick<Viewing,'customerId'>;
}){
  const router=useRouter();
  return <label className={s.categoryFilter}>
    <span>Category</span>
    <select value={value??ALL_CATEGORIES} onChange={event=>router.push(itemsHref(viewing,event.target.value||null))}>
      <option value={ALL_CATEGORIES}>All categories ({total})</option>
      {categories.map(c=><option key={c.id} value={c.id}>{c.name} ({c.count})</option>)}
    </select>
  </label>;
}
