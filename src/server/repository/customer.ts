// CUSTOMER-SAFE repository functions: the only data access customer-facing code and the LLM
// chat tools (spec §6.3) may use. Nothing exported here returns cost, unit_cost, margin, floors,
// Querent's pricing notes or internal notes, and customer data is always scoped to one customer.
//
// Adding an export? customer.test.ts calls every export and fails on any cost-like field, and
// fails until the new function is added to its call list.
export {access,customerAccessRules,enabledCategories,isCategory} from './access';
export {accountSummary,assignedRep,departments,supplier} from './accounts';
export {branches,catalogItem,catalogItems,productCategories,searchItems,stockForItems} from './catalog';
export {addMessage,appendLog,conversation,conversationMessages,createConversation,history} from './chat';
export {order,orderHistory,orders,orderStatus,purchasedItems} from './orders';
export {customerPrices} from './pricing';
export {customerQuote,customerQuotes} from './quotes';
