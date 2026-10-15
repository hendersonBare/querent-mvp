import type {Metadata} from 'next';
import {PageFrame} from '@/features/shell/PageFrame';
import {requireUser} from '@/features/auth/server';

export const metadata:Metadata={title:'Quotes'};

export default async function QuotesPage(){
  await requireUser('/quotes');
  return <PageFrame title="Quotes"><p>Saved quotes will be listed here. Coming soon.</p></PageFrame>;
}
