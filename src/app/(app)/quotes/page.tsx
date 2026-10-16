import type {Metadata} from 'next';
import {PageFrame} from '@/features/shell/PageFrame';
import {requireUser} from '@/features/auth/server';
import {QuotesTable} from '@/features/quotes/QuotesTable';
import {listQuotes} from '@/server/repository';

export const metadata:Metadata={title:'Quotes'};

// Every saved quote, newest first (docs/boxt/plan.md B6; src/features/quotes/QuotesTable.tsx).
export default async function QuotesPage(){
  const {db}=await requireUser('/quotes');
  const quotes=await listQuotes(db);
  return <PageFrame title="Quotes"><QuotesTable quotes={quotes}/></PageFrame>;
}
