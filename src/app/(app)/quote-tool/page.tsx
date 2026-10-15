import type {Metadata} from 'next';
import {PageFrame} from '@/features/shell/PageFrame';
import {requireUser} from '@/features/auth/server';

export const metadata:Metadata={title:'Quote creation tool'};

export default async function QuoteToolPage(){
  await requireUser('/quote-tool');
  return <PageFrame title="Quote creation tool"><p>Paste or upload a customer's list to match it to BOXT items. Coming soon.</p></PageFrame>;
}
