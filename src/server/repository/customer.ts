// CUSTOMER-SAFE repository functions: the only data access customer-facing code and the LLM
// chat tools (spec §6.3) may use. Nothing exported here returns cost, unit_cost, margin, floors,
// Querent's pricing notes or internal notes, and customer data is always scoped to one customer.
//
// Adding an export? customer.test.ts calls every export and fails on any cost-like field, and
// fails until the new function is added to its call list.
export {access,enabledCategories,isCategory} from './access';
export {accountSummary,assignedRep,assignedRepPicture,assignedRepProfile,deliveryAddress,departments,supplier} from './accounts';
export {branches,catalogItem,catalogItems,productCategories,stockForItems} from './catalog';
export {addMessage,appendLog,conversation,conversationMessages,createConversation,history,quoteNotices,repReplyNotices} from './chat';
export {notificationReads,quoteNews,saveNotificationReads,shippedOrders,type QuoteNewsRow,type ShippedOrderRow} from './notifications';
export {coPurchases,order,orderHistory,orders,orderStatus,purchasedItems} from './orders';
export {customerPrices} from './pricing';
export {customerQuote,customerQuoteRevision,customerQuotes,markCustomerViewed} from './quotes';
