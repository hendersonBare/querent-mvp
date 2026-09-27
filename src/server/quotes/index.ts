// The quote lifecycle (spec §5.4). This barrel is the pure, client-safe API: the transition table
// and guards, expiry and win/loss, the send blockers and the revision snapshot. Nothing here
// touches the database, so the rep portal and the customer's PDF modal can import it to enable
// buttons. The services that change a quote's status are server-only: import
// '@/server/quotes/service' (sendQuote, acceptQuote, requestChanges, expireQuote,
// expireOverdueQuotes, duplicateQuote, resetSample, sendCheck).
export * from './announce';
export * from './errors';
export * from './lifecycle';
export * from './send-check';
export * from './snapshot';
