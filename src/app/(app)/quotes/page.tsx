import type {Metadata} from 'next';
import {PageFrame} from '@/features/shell/PageFrame';

export const metadata:Metadata={title:'Quotes'};

export default function QuotesPage(){
  return <PageFrame title="Quotes"><p>Saved quotes will be listed here. Coming soon.</p></PageFrame>;
}
