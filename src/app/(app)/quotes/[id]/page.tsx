import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {requireUser} from '@/features/auth/server';
import {QuoteDetail} from '@/features/quotes/QuoteDetail';
import {isUuid} from '@/features/quotes/patch';
import {getQuote} from '@/server/repository';

// The title stays generic: a customer's name does not belong in browser history or tab titles.
export const metadata:Metadata={title:'Quote'};

// One saved quote: view, edit, delete (docs/boxt/plan.md B6; src/features/quotes/QuoteDetail.tsx).
// An unknown or malformed id renders ./not-found.tsx with a 404.
export default async function QuotePage({params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  const {db}=await requireUser(`/quotes/${encodeURIComponent(id)}`);
  const quote=isUuid(id)?await getQuote(db,id):null;
  if(!quote)notFound();
  return <QuoteDetail key={quote.updatedAt} initial={quote}/>;
}
