import {withApiUser} from '@/features/auth/api';
import {handleCreateQuote} from '@/features/quote-tool/save';

// POST /api/quotes: create a quote from the review dialog (src/features/quote-tool/save.ts).
export const POST=withApiUser(handleCreateQuote);
