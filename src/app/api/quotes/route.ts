import {withApiUser} from '@/features/auth/api';
import {listQuotesHandler} from '@/features/quotes/handlers';
import {handleCreateQuote} from '@/features/quote-tool/save';

// GET /api/quotes: every quote, newest first (src/features/quotes/handlers.ts, B6).
export const GET=withApiUser(listQuotesHandler);
// POST /api/quotes: create a quote from the review dialog (src/features/quote-tool/save.ts, B5).
export const POST=withApiUser(handleCreateQuote);
