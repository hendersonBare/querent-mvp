import type {AnchorHTMLAttributes,ReactNode} from 'react';
import {render} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {QUOTE_STATUSES} from '@/domain';
import {REP_STATUS} from '../quotes/labels';

// One set of quote status chip words and tones for the whole rep portal (cleanup 8): the Customers
// and Orders pages (task 3.8) show REP_STATUS, the Quotes list's own (task 3.2), not a copy.

vi.mock('next/link',()=>({default:({href,children,prefetch:_p,...rest}:AnchorHTMLAttributes<HTMLAnchorElement>&{href:string;prefetch?:boolean;children?:ReactNode})=><a href={href} {...rest}>{children}</a>}));
const {QuoteStatusChip}=await import('./parts');
const {StatusChip}=await import('../quotes/QuotesList');

it('shows every quote status in the Quotes list\'s words and tones',()=>{
  for(const status of QUOTE_STATUSES){
    const reference=render(<QuoteStatusChip status={status}/>).container.firstElementChild!;
    const list=render(<StatusChip status={status}/>).container.firstElementChild!;
    expect(reference.textContent).toBe(REP_STATUS[status].label);
    expect(reference.getAttribute('data-tone')).toBe(REP_STATUS[status].tone);
    expect(list.textContent).toBe(reference.textContent);
  }
});
