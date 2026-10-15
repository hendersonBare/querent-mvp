import {RecordNotFound} from '@/components/rep/reference/parts';

/** /rep/quotes/<number> for a quote that doesn't exist or isn't this rep's (decision 52: the U5 not-found layout). */
export default function QuoteNotFound(){
  return <RecordNotFound title="Quote not found" heading="This quote isn’t in your list" body="Check the quote number. Quotes for another rep’s customers stay in that rep’s list." back={{href:'/rep/quotes',label:'Back to quotes'}}/>;
}
