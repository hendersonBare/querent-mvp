import type {Metadata} from 'next';
import {SectionPlaceholder} from '@/components/rep/RepPage';

export const metadata:Metadata={title:'Customers'};

/** Customers (spec §4): read-only list and detail views, task 3.8. */
export default function CustomersPage(){
  return <SectionPlaceholder title="Customers" heading="Customer accounts will be listed here"
    body="Each customer's account number, assigned rep, terms, credit and recent activity, read-only from your ERP data."/>;
}
