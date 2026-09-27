import Link from 'next/link';
import page from '@/components/rep/RepPage.module.css';

/** /rep/quotes/<number> for a quote that doesn't exist or isn't this rep's. */
export default function QuoteNotFound(){
  return <>
    <div className={page.top}><h1 className={page.title}>Quote not found</h1></div>
    <section className={page.card} aria-labelledby="quote-not-found">
      <div className={page.empty}>
        <h2 id="quote-not-found">This quote isn’t in your list</h2>
        <p>Check the quote number. Quotes for another rep’s customers stay in that rep’s list.</p>
        <Link href="/rep/quotes">Back to quotes</Link>
      </div>
    </section>
  </>;
}
