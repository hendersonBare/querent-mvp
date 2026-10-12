'use client';
import {useRouter} from 'next/navigation';
import {referenceStyles as s} from '../reference/parts';
import {CATEGORY_PARAM} from './params';

// The Items page's only category filter: a dropdown, All by default. Choosing a category loads
// /rep/stock?category=<id>, so the page stays server-rendered
// and a filtered list can still be linked to.

export const ALL_CATEGORIES='';

/** The Items URL for one category, or every category. */
export const itemsHref=(categoryId:string|null)=>categoryId?`/rep/stock?${CATEGORY_PARAM}=${encodeURIComponent(categoryId)}`:'/rep/stock';

export interface CategoryOption {id:string;name:string;count:number}

export function CategorySelect({categories,value,total}:{
  categories:readonly CategoryOption[];
  /** The category shown, or null for all. */
  value:string|null;
  total:number;
}){
  const router=useRouter();
  return <label className={s.categoryFilter}>
    <span>Category</span>
    <select value={value??ALL_CATEGORIES} onChange={event=>router.push(itemsHref(event.target.value||null))}>
      <option value={ALL_CATEGORIES}>All categories ({total})</option>
      {categories.map(c=><option key={c.id} value={c.id}>{c.name} ({c.count})</option>)}
    </select>
  </label>;
}
