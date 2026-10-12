import type {AnchorHTMLAttributes,ReactNode} from 'react';
import {render} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {QUOTE_STATUSES} from '@/domain';
import {REP_STATUS} from '../quotes/labels';

// One set of quote status words for the whole rep portal (cleanup 8): the customer page (plan U5,
// C_CU3) prints REP_STATUS, the Quotes list's own words (task 3.2), as plain text, not a copy.

vi.mock('next/link',()=>({default:({href,children,prefetch:_p,...rest}:AnchorHTMLAttributes<HTMLAnchorElement>&{href:string;prefetch?:boolean;children?:ReactNode})=><a href={href} {...rest}>{children}</a>}));
const {QuoteStatusText}=await import('./parts');

it('shows every quote status in the Quotes list\'s words, as plain text',()=>{
  for(const status of QUOTE_STATUSES){
    const {container,unmount}=render(<QuoteStatusText status={status}/>);
    expect(container.textContent).toBe(REP_STATUS[status].label);
    expect(container.firstElementChild!.getAttribute('data-tone')).toBeNull();
    unmount();
  }
});
