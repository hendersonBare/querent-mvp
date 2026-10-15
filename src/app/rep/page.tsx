import {redirect} from 'next/navigation';
import {HOME_SECTION} from '@/components/rep/scope';

/** /rep opens Quotes. Nothing is carried over: scope is role based (task U1). */
export default function RepHome(){
  redirect(HOME_SECTION.href);
}
