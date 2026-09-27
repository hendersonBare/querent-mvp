import type {Metadata} from 'next';
import {SectionPlaceholder} from '@/components/rep/RepPage';

export const metadata:Metadata={title:'Orders'};

/** Orders (spec §4): read-only list and detail views, task 3.8. */
export default function OrdersPage(){
  return <SectionPlaceholder title="Orders" heading="Orders will be listed here"
    body="Each order with its PO, date, status and lines, read-only from your ERP data."/>;
}
