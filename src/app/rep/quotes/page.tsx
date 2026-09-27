import type {Metadata} from 'next';
import {SectionPlaceholder} from '@/components/rep/RepPage';

export const metadata:Metadata={title:'Quotes'};

/** Quotes (spec §4). Task 3.2 builds the list: status, customer, date, total, margin, changes_requested highlighted. */
export default function QuotesPage(){
  return <SectionPlaceholder title="Quotes" showUnreadQuotes heading="Your quotes will be listed here"
    body="Each quote with its status, customer, date, total and margin, newest first. Quotes where the customer asked for changes are highlighted with their note."/>;
}
