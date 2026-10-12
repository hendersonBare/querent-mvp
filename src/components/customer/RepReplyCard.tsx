'use client';
import {useId} from 'react';
import {MessageSquare} from 'lucide-react';
import type {RepReplyNotice} from '@/domain';

// The rep's reply to a change request in the customer's chat (decision 63, plan U3): posted from the
// rep's Quotes page (C_QOB6 "Send reply"). No frame draws it: it is the "quote is ready" card
// (./QuoteNoticeCard) with "Brandi Gallegos replied about Q-24790" and the reply as the rep typed it,
// and no button (docs/plans/status.md "No frame").
//
// The reply is plain text: React renders it as text (never Markdown or HTML), and CSS keeps its line breaks.

export function RepReplyCard({notice}:{notice:RepReplyNotice}){
  const headline=useId();
  return <article className="chat-turn quote-notice" aria-labelledby={headline}>
    <div className="answer-row">
      <span className="avatar brand-avatar"><img src="/querent-logo.png" alt="Querent"/></span>
      <div className="answer-content">
        <div className="qn-card">
          <span className="qn-doc" aria-hidden="true"><MessageSquare size={20}/></span>
          <div className="qn-body">
            <p className="qn-headline" id={headline}>{`${notice.rep_name} replied about ${notice.quote_number}`}</p>
            <p className="qn-text">{notice.text}</p>
          </div>
        </div>
      </div>
    </div>
  </article>;
}
