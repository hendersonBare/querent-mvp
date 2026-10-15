import type {Metadata} from 'next';
import {PageFrame} from '@/features/shell/PageFrame';
import {requireUser} from '@/features/auth/server';
import {QuoteTool} from '@/features/quote-tool/QuoteTool';

export const metadata:Metadata={title:'Quote creation tool'};

export default async function QuoteToolPage(){
  await requireUser('/quote-tool');
  return <PageFrame title="Quote creation tool"
    description="Paste or upload a customer's list. Each line is matched to a BOXT item only when the match is clear; the rest are left for you to decide.">
    <QuoteTool/>
  </PageFrame>;
}
