import {redirect} from 'next/navigation';
import {HOME_SECTION,SCOPE_PARAM,scopedHref} from '@/components/rep/scope';

/** /rep opens Quotes, keeping the picked customer. */
export default async function RepHome({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const customer=(await searchParams)[SCOPE_PARAM];
  redirect(scopedHref(HOME_SECTION.href,typeof customer==='string'&&customer?customer:null));
}
