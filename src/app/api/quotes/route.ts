import {withApiUser} from '@/features/auth/api';
import {listQuotesHandler} from '@/features/quotes/handlers';

// GET /api/quotes: every quote, newest first (src/features/quotes/handlers.ts). POST (create) is B5's.
export const GET=withApiUser(listQuotesHandler);
