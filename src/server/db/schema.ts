import {QUOTE_STATUSES} from '../../domain/quotes';
import {categories} from '../../lib/contracts';

// Schema constants. The DDL itself lives in the numbered migrations (src/server/db/migrations,
// spec §1.1): change the schema by adding the next NNN_<slug>.sql file.

// Tables a future ERP sync (Prophet 21 etc.) upserts into, keyed on (source, external_id).
// Everything else is owned by Querent. Spec §6.2.
export const ERP_SOURCED_TABLES=['branches','product_categories','items','branch_stock','price_levels','customer_prices','contracts','contract_lines','customers','contacts','reps','orders','order_lines'] as const;

// The information categories a customer can be allowed to ask about in chat.
export const INFO_CATEGORIES=categories;

// The domain types (src/domain) own these values; migrations/001_baseline.sql writes them out in its CHECKs.
export {QUOTE_STATUSES};
