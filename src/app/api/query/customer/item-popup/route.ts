import {customerGet} from '@/server/customer/http';
import {itemPopupContext} from '@/server/customer/item-popup';
export const runtime='nodejs';export const dynamic='force-dynamic';

/**
 * GET /api/query/customer/item-popup?skus=A,B (task 2.3): what the item pop-up shows next to its
 * lines, read when it renders: each item's identity and stock per branch (none when Items & stock
 * is off), the branches, the ship-to on file and the rep. No prices.
 */
export const GET=customerGet((customerId,request)=>itemPopupContext(customerId,(request.nextUrl.searchParams.get('skus')??'').split(',')));
