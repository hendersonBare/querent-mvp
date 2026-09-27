'use client';
import {useId} from 'react';
import {FileText} from 'lucide-react';
import type {QuoteNotice} from '@/domain';
import {emitOpenQuote} from './open-quote';

// "Quote Q-24817 is ready: $X, valid until Oct 7" in the customer's chat (spec §3, task 5.1): the
// message Approve & send posted (task 3.7). The headline, then the rep's message exactly as they
// typed it, then View quote, which opens the PDF preview modal on the revision it announced.
//
// The rep's message is plain text: React renders it as text (never Markdown or HTML), and CSS keeps
// its line breaks.

export function QuoteNoticeCard({notice}:{notice:QuoteNotice}){
  const headline=useId();
  return <article className="chat-turn quote-notice" aria-labelledby={headline}>
    <div className="answer-row">
      <span className="avatar brand-avatar"><img src="/querent-logo.png" alt="Querent"/></span>
      <div className="answer-content">
        <div className="qn-card">
          <span className="qn-doc" aria-hidden="true"><FileText size={20}/></span>
          <div className="qn-body">
            <p className="qn-headline" id={headline}>{notice.headline}</p>
            {notice.text&&<p className="qn-text">{notice.text}</p>}
            <button type="button" className="qn-view" aria-haspopup="dialog"
              onClick={()=>emitOpenQuote({id:notice.quote_id,quote_number:notice.quote_number,revision:notice.revision})}>
              <FileText size={16} aria-hidden="true"/>View quote
            </button>
          </div>
        </div>
      </div>
    </div>
  </article>;
}
