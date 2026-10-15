// The repository: every read and write of Querent data is a typed function here (spec §6.1).
// No SQL anywhere else; a future ERP sync sits behind these functions.
//
// This barrel is the full INTERNAL API (rep portal, pricing and quote services). Some of it
// returns cost and margin. Customer-facing code and the LLM chat tools import
// '@/server/repository/customer' instead, which never does.
export * from './access';
export * from './accounts';
export * from './analytics';
export * from './catalog';
export * from './chat';
export * from './demo';
export * from './erp';
export * from './freight';
export * from './notifications';
export * from './orders';
export * from './pricing';
export * from './quotes';
export * from './settings';
export * from './table-prefs';
export * from './team';
export * from './teams';
export {inTransaction} from './sql';
