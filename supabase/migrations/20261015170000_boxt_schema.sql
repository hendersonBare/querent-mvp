-- BOXT quote tool: tables, the quote summary view and the bookkeeping triggers.
-- docs/boxt/plan.md "Database". Grants, RLS and the example-quote guard are in
-- 20261015170100_boxt_security.sql; the quote write functions in 20261015170200_boxt_quote_rpcs.sql.

-- Helpers live in a schema PostgREST does not expose, so they are never callable as /rpc endpoints.
create schema if not exists private;

-- ---- Helpers ----------------------------------------------------------------------------------

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

-- Activity metadata is counts, scores, thresholds, flags and short enum values, never customer text
-- (product rule 8). This is the database's backstop; src/server/repository/sanitize.ts is the strict
-- filter in front of it (it also limits strings to a fixed list of enum values). A flat object of at
-- most 24 keys; keys are identifiers; values are numbers, booleans, null, or lower-case identifier
-- strings of at most 32 characters.
create function private.activity_metadata_is_safe(metadata jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(metadata) = 'object'
    and (select count(*) from jsonb_object_keys(metadata)) <= 24
    and not exists (
      select 1
      from jsonb_each(metadata) as e(key, value)
      where e.key !~ '^[a-z][A-Za-z0-9_]{0,39}$'
         or not (
           jsonb_typeof(e.value) in ('number', 'boolean', 'null')
           or (jsonb_typeof(e.value) = 'string' and (e.value #>> '{}') ~ '^[a-z][a-z0-9_]{0,31}$')
         )
    )
$$;

-- ---- Catalog ------------------------------------------------------------------------------------

-- The BOXT catalog (data/boxt-catalog.json, loaded by scripts/seed-boxt.ts). list_price is the public
-- web list price: a reference label only, never a quote price (product rule 5).
create table public.catalog_items (
  id bigint generated always as identity primary key,
  sku text not null,
  description text not null,
  category text,
  pack text,
  case_qty integer,
  list_price numeric(12, 2),
  keywords text not null default '',
  source text not null default 'boxtpackaging.com',
  external_id text,
  synced_at timestamptz,
  search tsvector generated always as (
    setweight(to_tsvector('english'::regconfig, sku), 'A')
    || setweight(to_tsvector('english'::regconfig, description), 'A')
    || setweight(to_tsvector('english'::regconfig, coalesce(category, '')), 'B')
    || setweight(to_tsvector('english'::regconfig, keywords), 'C')
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalog_items_sku_key unique (sku),
  constraint catalog_items_sku_not_blank check (btrim(sku) <> ''),
  constraint catalog_items_description_not_blank check (btrim(description) <> ''),
  constraint catalog_items_case_qty_positive check (case_qty is null or case_qty > 0),
  constraint catalog_items_list_price_not_negative check (list_price is null or list_price >= 0)
);

create index catalog_items_search_idx on public.catalog_items using gin (search);
create index catalog_items_category_idx on public.catalog_items (category);

create trigger catalog_items_set_updated_at
  before update on public.catalog_items
  for each row execute function private.set_updated_at();

-- ---- Quotes -------------------------------------------------------------------------------------

-- A BOXT quote: customer name, reference, lines, total (product rule 6). match_strictness is the level
-- the lines were matched at. created_by / created_by_email come from the session (auth.uid(), the JWT).
create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null default '',
  reference text not null default '',
  is_example boolean not null default false,
  match_strictness text not null default 'strict',
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_by_email text default (auth.jwt() ->> 'email'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quotes_customer_name_length check (char_length(customer_name) <= 200),
  constraint quotes_reference_length check (char_length(reference) <= 200),
  constraint quotes_match_strictness_check check (match_strictness in ('strict', 'balanced', 'lenient'))
);

create index quotes_created_at_idx on public.quotes (created_at desc);
-- There is one example quote at most.
create unique index quotes_one_example_idx on public.quotes (is_example) where is_example;

create trigger quotes_set_updated_at
  before update on public.quotes
  for each row execute function private.set_updated_at();

-- A quote line keeps what the rep saw: the customer's original text, the item (a snapshot, so a
-- catalog refresh never rewrites a saved quote), quantity, unit price, who matched it, and for an
-- unmatched line its near-miss candidates. list_price is a reference only.
create table public.quote_lines (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes (id) on delete cascade,
  position integer not null,
  sku text,
  description text,
  pack text,
  list_price numeric(12, 2),
  quantity numeric(14, 3),
  unit text,
  quantity_unclear boolean not null default false,
  unit_price numeric(12, 4),
  matched_by text,
  original_text text not null,
  unmatched boolean not null default false,
  match_score double precision,
  near_misses jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quote_lines_position_key unique (quote_id, position),
  constraint quote_lines_position_positive check (position > 0),
  constraint quote_lines_quantity_positive check (quantity is null or quantity > 0),
  constraint quote_lines_unit_price_not_negative check (unit_price is null or unit_price >= 0),
  constraint quote_lines_list_price_not_negative check (list_price is null or list_price >= 0),
  constraint quote_lines_matched_by_check check (matched_by in ('auto', 'rep')),
  -- Matched: an item (SKU) and who matched it. Unmatched: neither.
  constraint quote_lines_outcome check (
    case when unmatched then matched_by is null and sku is null
         else matched_by is not null and sku is not null and btrim(sku) <> '' end
  ),
  constraint quote_lines_original_text_not_blank check (btrim(original_text) <> ''),
  constraint quote_lines_original_text_length check (char_length(original_text) <= 2000),
  constraint quote_lines_near_misses_array check (
    case when jsonb_typeof(near_misses) = 'array' then jsonb_array_length(near_misses) <= 10 else false end
  )
);

create trigger quote_lines_set_updated_at
  before update on public.quote_lines
  for each row execute function private.set_updated_at();

-- The Quotes list: one row per quote with its line count, unmatched count and total. The total is
-- the sum of round(quantity × unit_price, 2) over matched lines that have both. security_invoker: the
-- caller's RLS applies, so the view shows exactly the quotes the caller may read.
create view public.quote_summaries
with (security_invoker = true)
as
select
  q.id,
  q.customer_name,
  q.reference,
  q.is_example,
  q.match_strictness,
  q.created_by,
  q.created_by_email,
  q.created_at,
  q.updated_at,
  count(l.id)::integer as line_count,
  (count(l.id) filter (where l.unmatched))::integer as unmatched_count,
  coalesce(sum(round(l.quantity * l.unit_price, 2)) filter (where not l.unmatched), 0)::numeric(14, 2) as total
from public.quotes q
left join public.quote_lines l on l.quote_id = q.id
group by q.id;

-- ---- Settings -----------------------------------------------------------------------------------

-- Organization settings: one row (id = 1). Match strictness defaults to strict.
create table public.org_settings (
  id smallint primary key default 1,
  match_strictness text not null default 'strict',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  constraint org_settings_single_row check (id = 1),
  constraint org_settings_match_strictness_check check (match_strictness in ('strict', 'balanced', 'lenient'))
);

insert into public.org_settings (id, match_strictness) values (1, 'strict');

create function private.org_settings_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end
$$;

create trigger org_settings_touch
  before update on public.org_settings
  for each row execute function private.org_settings_touch();

-- ---- Activity log -------------------------------------------------------------------------------

-- Who did what, when; metadata holds counts, scores and thresholds only. App users may insert their
-- own rows and never read any.
create table public.activity_log (
  id bigint generated always as identity primary key,
  user_id uuid default auth.uid() references auth.users (id) on delete set null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint activity_log_action_check check (
    action in ('login', 'logout', 'match_run', 'quote_create', 'quote_update', 'quote_delete', 'settings_change')
  ),
  constraint activity_log_metadata_safe check (private.activity_metadata_is_safe(metadata))
);

create index activity_log_created_at_idx on public.activity_log (created_at desc);
create index activity_log_user_id_idx on public.activity_log (user_id);
