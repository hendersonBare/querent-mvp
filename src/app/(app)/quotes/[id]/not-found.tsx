import Link from 'next/link';
import {PageFrame} from '@/features/shell/PageFrame';

// An unknown quote id (or one deleted since): one plain line and the way back.
export default function QuoteNotFound(){
  return <PageFrame title="Quote not found">
    <p>This quote does not exist, or it was deleted. <Link href="/quotes">Back to quotes</Link></p>
  </PageFrame>;
}
