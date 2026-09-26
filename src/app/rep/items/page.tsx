import type {Metadata} from 'next';
import {SectionPlaceholder} from '@/components/rep/RepPage';

export const metadata:Metadata={title:'Items'};

/** Items (spec §4): read-only list and detail views, task 3.8. */
export default function ItemsPage(){
  return <SectionPlaceholder title="Items" heading="The catalog will be listed here"
    body="Each item with its SKU, pack, list price and stock at SLC, Ogden and Provo, read-only from your ERP data."/>;
}
