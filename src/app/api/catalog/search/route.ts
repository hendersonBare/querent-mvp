import {withApiUser} from '@/features/auth/api';
import {handleCatalogSearch} from '@/features/quote-tool/search';

// GET /api/catalog/search?q=: the review dialog's Swap search (src/features/quote-tool/search.ts).
export const GET=withApiUser(handleCatalogSearch);
