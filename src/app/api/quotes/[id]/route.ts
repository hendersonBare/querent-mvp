import {withApiUser} from '@/features/auth/api';
import {deleteQuoteHandler,getQuoteHandler,patchQuoteHandler} from '@/features/quotes/handlers';

// GET, PATCH and DELETE /api/quotes/[id] (src/features/quotes/handlers.ts).
export const GET=withApiUser(getQuoteHandler);
export const PATCH=withApiUser(patchQuoteHandler);
export const DELETE=withApiUser(deleteQuoteHandler);
