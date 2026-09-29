import type Database from 'better-sqlite3';
import {FULFILLMENTS} from '../../domain/orders';
import {PRICE_BASES as BASES,QUOTE_STATUSES} from '../../domain/quotes';
import {categories} from '../../lib/contracts';

// Bump on any schema change. There are no migrations: an older database refuses to
// open and `npm run db:reset` rebuilds and reseeds it (spec §6.6).
export const SCHEMA_VERSION=4;

// Tables a future ERP sync (Prophet 21 etc.) upserts into, keyed on (source, external_id).
// Everything else is owned by Querent. Spec §6.2.
export const ERP_SOURCED_TABLES=['branches','product_categories','items','branch_stock','price_levels','customer_prices','contracts','contract_lines','customers','contacts','reps','orders','order_lines'] as const;

// The information categories a customer can be allowed to ask about in chat.
export const INFO_CATEGORIES=categories;

const SYNC="source TEXT NOT NULL DEFAULT 'seed',external_id TEXT,synced_at TEXT";
const list=(values:readonly string[])=>values.map(v=>`'${v}'`).join(',');
const FULFILLMENT=`CHECK(fulfillment IN (${list(FULFILLMENTS)}))`;
const PRICE_BASES=list(BASES);
// The domain types (src/domain) own these values so the CHECK constraints and the TS types agree.
export {QUOTE_STATUSES};

const DDL=`
CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);

-- Supplier (one per deployment) and key/value settings, e.g. scarcity_uplift_enabled.
CREATE TABLE IF NOT EXISTS suppliers(id TEXT PRIMARY KEY,name TEXT NOT NULL,address TEXT NOT NULL,city TEXT NOT NULL,state TEXT NOT NULL,zip TEXT NOT NULL,phone TEXT NOT NULL,email TEXT NOT NULL,website TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS branches(id TEXT PRIMARY KEY,code TEXT NOT NULL UNIQUE,name TEXT NOT NULL,address TEXT NOT NULL,city TEXT NOT NULL,state TEXT NOT NULL,zip TEXT NOT NULL,lat REAL NOT NULL,lng REAL NOT NULL,will_call_phone TEXT NOT NULL,will_call_hours TEXT NOT NULL,${SYNC});
CREATE TABLE IF NOT EXISTS product_categories(id TEXT PRIMARY KEY,name TEXT NOT NULL UNIQUE,sort_order INTEGER NOT NULL,${SYNC});
-- pack: the selling unit as printed ("Box of 50"); prices and qty are per pack.
-- case_qty: packs in a full case; a quoted qty below it is a broken case (spec §5.1).
-- keywords: extra words for item search (e.g. "bolt" for hex cap screws).
CREATE TABLE IF NOT EXISTS items(id TEXT PRIMARY KEY,sku TEXT NOT NULL UNIQUE,description TEXT NOT NULL,category_id TEXT NOT NULL REFERENCES product_categories(id),pack TEXT NOT NULL,case_qty INTEGER NOT NULL CHECK(case_qty>=1),cost REAL NOT NULL CHECK(cost>=0),list_price REAL NOT NULL CHECK(list_price>=0),keywords TEXT NOT NULL DEFAULT '',${SYNC});
CREATE INDEX IF NOT EXISTS items_category ON items(category_id);
CREATE TABLE IF NOT EXISTS branch_stock(item_id TEXT NOT NULL REFERENCES items(id),branch_id TEXT NOT NULL REFERENCES branches(id),available INTEGER NOT NULL,on_order INTEGER NOT NULL DEFAULT 0,next_receipt_on TEXT,${SYNC},PRIMARY KEY(item_id,branch_id));

-- Customer price = the customer_prices row for the customer's price level.
CREATE TABLE IF NOT EXISTS price_levels(id TEXT PRIMARY KEY,code TEXT NOT NULL UNIQUE,name TEXT NOT NULL,${SYNC});
CREATE TABLE IF NOT EXISTS customer_prices(id TEXT PRIMARY KEY,price_level_id TEXT NOT NULL REFERENCES price_levels(id),item_id TEXT NOT NULL REFERENCES items(id),unit_price REAL NOT NULL CHECK(unit_price>=0),${SYNC},UNIQUE(price_level_id,item_id));

-- Placeholder customers carry only name, account number and (via customer_rep) a rep; the rest is NULL.
CREATE TABLE IF NOT EXISTS customers(id TEXT PRIMARY KEY,account_number TEXT NOT NULL UNIQUE,name TEXT NOT NULL,terms TEXT,credit_limit REAL,open_balance REAL,past_due_balance REAL,tax_status TEXT CHECK(tax_status IN ('taxable','exempt')),tax_state TEXT,price_level_id TEXT REFERENCES price_levels(id),main_phone TEXT,ship_to_name TEXT,ship_to_address TEXT,ship_to_city TEXT,ship_to_state TEXT,ship_to_zip TEXT,ship_to_lat REAL,ship_to_lng REAL,${SYNC});
CREATE TABLE IF NOT EXISTS contacts(id TEXT PRIMARY KEY,customer_id TEXT NOT NULL REFERENCES customers(id),name TEXT NOT NULL,title TEXT,phone TEXT,email TEXT,is_primary INTEGER NOT NULL DEFAULT 0,${SYNC});
-- A contract is active on day D when starts_on <= D <= ends_on (ISO dates).
CREATE TABLE IF NOT EXISTS contracts(id TEXT PRIMARY KEY,customer_id TEXT NOT NULL REFERENCES customers(id),contract_number TEXT NOT NULL UNIQUE,name TEXT NOT NULL,starts_on TEXT NOT NULL,ends_on TEXT NOT NULL,${SYNC},CHECK(ends_on>=starts_on));
CREATE TABLE IF NOT EXISTS contract_lines(id TEXT PRIMARY KEY,contract_id TEXT NOT NULL REFERENCES contracts(id),item_id TEXT NOT NULL REFERENCES items(id),unit_price REAL NOT NULL CHECK(unit_price>=0),${SYNC},UNIQUE(contract_id,item_id));

CREATE TABLE IF NOT EXISTS reps(id TEXT PRIMARY KEY,name TEXT NOT NULL,initials TEXT NOT NULL,title TEXT NOT NULL,phone TEXT NOT NULL,email TEXT NOT NULL,${SYNC});
-- Exactly one rep per customer. A quote's rep is always the customer's rep (spec §5.2).
CREATE TABLE IF NOT EXISTS customer_rep(customer_id TEXT PRIMARY KEY REFERENCES customers(id),rep_id TEXT NOT NULL REFERENCES reps(id));
-- margin_floor is a fraction (0.20 = 20%) for (rep x product category).
CREATE TABLE IF NOT EXISTS rep_category_floors(rep_id TEXT NOT NULL REFERENCES reps(id),category_id TEXT NOT NULL REFERENCES product_categories(id),margin_floor REAL NOT NULL CHECK(margin_floor>=0 AND margin_floor<1),updated_at TEXT NOT NULL,PRIMARY KEY(rep_id,category_id));
-- Static contacts for the customer sidebar; will-call rows point at their branch.
CREATE TABLE IF NOT EXISTS departments(id TEXT PRIMARY KEY,name TEXT NOT NULL,branch_id TEXT REFERENCES branches(id),phone TEXT NOT NULL,email TEXT,hours TEXT NOT NULL,sort_order INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS delivery_rates(id TEXT PRIMARY KEY,base_fee REAL NOT NULL CHECK(base_fee>=0),per_mile REAL NOT NULL CHECK(per_mile>=0),min_charge REAL NOT NULL CHECK(min_charge>=0),free_threshold REAL NOT NULL CHECK(free_threshold>=0),max_radius_miles REAL NOT NULL CHECK(max_radius_miles>0),road_factor REAL NOT NULL DEFAULT 1.25 CHECK(road_factor>=1));

-- Orders are the source of "last paid" and of won-quote history (quote_id).
CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY,order_number TEXT NOT NULL UNIQUE,customer_id TEXT NOT NULL REFERENCES customers(id),quote_id TEXT REFERENCES quotes(id),po_number TEXT,order_date TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('open','shipped','closed')),fulfillment TEXT NOT NULL ${FULFILLMENT},branch_id TEXT NOT NULL REFERENCES branches(id),shipped_on TEXT,tracking_number TEXT,subtotal REAL NOT NULL,freight REAL NOT NULL,tax REAL NOT NULL,total REAL NOT NULL,${SYNC});
CREATE INDEX IF NOT EXISTS orders_customer_date ON orders(customer_id,order_date);
CREATE TABLE IF NOT EXISTS order_lines(id TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES orders(id),line_no INTEGER NOT NULL,item_id TEXT NOT NULL REFERENCES items(id),qty INTEGER NOT NULL CHECK(qty>0),unit_price REAL NOT NULL,unit_cost REAL NOT NULL,${SYNC},UNIQUE(order_id,line_no));
CREATE INDEX IF NOT EXISTS order_lines_item ON order_lines(item_id);

-- Quotes (spec §5.4). revision = the last sent revision (0 = never sent). valid_until is set on send:
-- expires_on when the rep picked an expiration date, otherwise the send day + valid_days. requested_date is the pickup/delivery day asked for in chat; fulfillment_time is
-- what the customer confirms on Accept. freight is computed; only a rep override is stored.
CREATE TABLE IF NOT EXISTS quotes(id TEXT PRIMARY KEY,quote_number TEXT NOT NULL UNIQUE,customer_id TEXT NOT NULL REFERENCES customers(id),contact_id TEXT REFERENCES contacts(id),rep_id TEXT NOT NULL REFERENCES reps(id),status TEXT NOT NULL CHECK(status IN (${list(QUOTE_STATUSES)})),revision INTEGER NOT NULL DEFAULT 0,conversation_id TEXT REFERENCES conversations(id),request_text TEXT,requested_at TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,sent_at TEXT,responded_at TEXT,fulfillment TEXT NOT NULL ${FULFILLMENT},branch_id TEXT NOT NULL REFERENCES branches(id),requested_date TEXT,fulfillment_time TEXT,ship_to_address TEXT,ship_to_lat REAL,ship_to_lng REAL,freight_override REAL,freight_override_reason TEXT,valid_days INTEGER NOT NULL DEFAULT 14 CHECK(valid_days IN (7,14,30)),valid_until TEXT,expires_on TEXT CHECK(expires_on IS NULL OR expires_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),customer_po TEXT,customer_note TEXT,change_request_note TEXT,unread_for_rep INTEGER NOT NULL DEFAULT 0,unread_for_customer INTEGER NOT NULL DEFAULT 0,is_sample INTEGER NOT NULL DEFAULT 0,duplicated_from TEXT REFERENCES quotes(id));
CREATE INDEX IF NOT EXISTS quotes_customer ON quotes(customer_id,requested_at);
-- unit_price NULL = not priced yet. suggested_* is Querent's pick; customer_price is kept for "+$X GP vs customer price".
CREATE TABLE IF NOT EXISTS quote_lines(id TEXT PRIMARY KEY,quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,line_no INTEGER NOT NULL,item_id TEXT NOT NULL REFERENCES items(id),qty INTEGER NOT NULL CHECK(qty>=0),unit_price REAL,price_basis TEXT CHECK(price_basis IN (${PRICE_BASES})),suggested_price REAL,suggested_basis TEXT CHECK(suggested_basis IN (${PRICE_BASES})),customer_price REAL,unit_cost REAL NOT NULL,explanation TEXT,requested_text TEXT,match_score REAL,added_by TEXT NOT NULL DEFAULT 'querent' CHECK(added_by IN ('querent','rep','upsell')),UNIQUE(quote_id,line_no));
-- A line the rep removed, kept so Undo puts it back with what Querent recorded about it (who added it,
-- the match score, the customer's words): those come from here, never from the request (task 7.1).
CREATE TABLE IF NOT EXISTS quote_removed_lines(quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,line_no INTEGER NOT NULL,item_id TEXT NOT NULL REFERENCES items(id),requested_text TEXT,match_score REAL,added_by TEXT NOT NULL CHECK(added_by IN ('querent','rep','upsell')),removed_at TEXT NOT NULL,PRIMARY KEY(quote_id,line_no));
-- Frozen copy of what the customer was sent, one row per send ("Q-24817 rev 2").
CREATE TABLE IF NOT EXISTS quote_revisions(id TEXT PRIMARY KEY,quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,revision INTEGER NOT NULL,sent_at TEXT NOT NULL,sent_by TEXT NOT NULL REFERENCES reps(id),message TEXT,attach_pdf INTEGER NOT NULL DEFAULT 1,total REAL NOT NULL,snapshot TEXT NOT NULL,UNIQUE(quote_id,revision));
CREATE TABLE IF NOT EXISTS quote_activity(id INTEGER PRIMARY KEY AUTOINCREMENT,quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,at TEXT NOT NULL,actor TEXT NOT NULL CHECK(actor IN ('customer','querent','rep','system')),actor_id TEXT,kind TEXT NOT NULL,message TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS quote_activity_quote ON quote_activity(quote_id,at);
CREATE TABLE IF NOT EXISTS quote_notes(id INTEGER PRIMARY KEY AUTOINCREMENT,quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,rep_id TEXT NOT NULL REFERENCES reps(id),body TEXT NOT NULL,created_at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS conversations(id TEXT PRIMARY KEY,customer_id TEXT NOT NULL REFERENCES customers(id),contact_id TEXT REFERENCES contacts(id),started_at TEXT NOT NULL);
-- kind: text, item_popup, quote_requested, quote_ready, ...; payload is kind-specific JSON.
CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,role TEXT NOT NULL CHECK(role IN ('customer','assistant','system')),kind TEXT NOT NULL DEFAULT 'text',content TEXT NOT NULL,payload TEXT,created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS messages_conversation ON messages(conversation_id,created_at);
CREATE TABLE IF NOT EXISTS query_logs(id TEXT PRIMARY KEY,customer_id TEXT NOT NULL REFERENCES customers(id),conversation_id TEXT NOT NULL,question TEXT NOT NULL,categories TEXT NOT NULL,handled_categories TEXT NOT NULL,tool_calls TEXT NOT NULL DEFAULT '[]',row_count INTEGER NOT NULL,latency_ms INTEGER NOT NULL,outcome TEXT NOT NULL,answer TEXT NOT NULL,timestamp TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS query_logs_scope ON query_logs(customer_id,conversation_id,timestamp);
-- Customer x information category toggles (Settings > Customer access).
CREATE TABLE IF NOT EXISTS access(customer_id TEXT NOT NULL REFERENCES customers(id),category TEXT NOT NULL CHECK(category IN (${list(INFO_CATEGORIES)})),enabled INTEGER NOT NULL,PRIMARY KEY(customer_id,category));
CREATE TABLE IF NOT EXISTS sync_events(id INTEGER PRIMARY KEY AUTOINCREMENT,timestamp TEXT,message TEXT);
${ERP_SOURCED_TABLES.map(t=>`CREATE UNIQUE INDEX IF NOT EXISTS ${t}_external ON ${t}(source,external_id);`).join('\n')}
`;

export function applySchema(database:Database.Database){database.exec(DDL);}
