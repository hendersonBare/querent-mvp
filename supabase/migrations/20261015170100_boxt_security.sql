-- BOXT quote tool: grants, row-level security and the example-quote guard.
-- docs/boxt/plan.md "Database" and product rule 7: RLS on every table, policies for `authenticated`
-- only, and `anon` (the public API key without a session) has no grant on anything.

-- ---- Nothing new reaches anon ---------------------------------------------------------------------

-- Objects created later by this role (the migration role) grant nothing to anon either. Functions
-- otherwise get EXECUTE for PUBLIC (which anon belongs to) by default; that default is global.
alter default privileges revoke execute on functions from public;
alter default privileges revoke all on tables from anon;
alter default privileges revoke all on sequences from anon;
alter default privileges revoke all on functions from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;
alter default privileges in schema private revoke all on tables from anon;
alter default privileges in schema private revoke all on sequences from anon;
alter default privileges in schema private revoke all on functions from anon;

-- ---- Explicit grants ------------------------------------------------------------------------------

revoke all on table
  public.catalog_items, public.quotes, public.quote_lines, public.quote_summaries,
  public.org_settings, public.activity_log
from public, anon, authenticated;
revoke all on all sequences in schema public from public, anon, authenticated;
revoke all on schema private from public, anon;
revoke all on all functions in schema private from public, anon, authenticated;

grant usage on schema private to authenticated, service_role;

-- Signed-in users: read the catalog; read and change the strictness; read and write quotes (only the
-- columns a user may set: id, is_example, created_by, created_by_email and timestamps come from
-- defaults and triggers); insert their own activity rows and never read them.
grant select on public.catalog_items to authenticated;

grant select on public.org_settings to authenticated;
grant update (match_strictness) on public.org_settings to authenticated;

grant select, delete on public.quotes to authenticated;
grant insert (customer_name, reference, match_strictness) on public.quotes to authenticated;
grant update (customer_name, reference) on public.quotes to authenticated;

grant select, delete on public.quote_lines to authenticated;
grant insert (
  quote_id, position, sku, description, pack, list_price, quantity, unit, quantity_unclear, unit_price,
  matched_by, original_text, unmatched, match_score, near_misses
) on public.quote_lines to authenticated;
grant update (
  position, sku, description, pack, list_price, quantity, unit, quantity_unclear, unit_price,
  matched_by, original_text, unmatched, match_score, near_misses
) on public.quote_lines to authenticated;

grant select on public.quote_summaries to authenticated;

grant insert (action, metadata) on public.activity_log to authenticated;

-- The service role (scripts and operators only; RLS does not apply to it, the example-quote trigger does).
grant all on table
  public.catalog_items, public.quotes, public.quote_lines, public.quote_summaries,
  public.org_settings, public.activity_log
to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Helpers that run as the calling user (inside triggers, constraints and the quote functions).
grant execute on function private.set_updated_at() to authenticated, service_role;
grant execute on function private.org_settings_touch() to authenticated, service_role;
grant execute on function private.activity_metadata_is_safe(jsonb) to authenticated, service_role;

-- ---- Row-level security ---------------------------------------------------------------------------

alter table public.catalog_items enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_lines enable row level security;
alter table public.org_settings enable row level security;
alter table public.activity_log enable row level security;

create policy "catalog_items: signed-in users read"
  on public.catalog_items for select to authenticated
  using (true);

create policy "org_settings: signed-in users read"
  on public.org_settings for select to authenticated
  using (true);

create policy "org_settings: signed-in users update"
  on public.org_settings for update to authenticated
  using (id = 1) with check (id = 1);

-- Every signed-in user may read, edit and delete any quote (one company, all users equal; plan "Open
-- assumptions"), except the example quote, which nobody changes.
create policy "quotes: signed-in users read"
  on public.quotes for select to authenticated
  using (true);

create policy "quotes: signed-in users create (not the example)"
  on public.quotes for insert to authenticated
  with check (not is_example);

create policy "quotes: signed-in users update (not the example)"
  on public.quotes for update to authenticated
  using (not is_example) with check (not is_example);

create policy "quotes: signed-in users delete (not the example)"
  on public.quotes for delete to authenticated
  using (not is_example);

create policy "quote_lines: signed-in users read"
  on public.quote_lines for select to authenticated
  using (true);

create policy "quote_lines: signed-in users add (not to the example)"
  on public.quote_lines for insert to authenticated
  with check (exists (select 1 from public.quotes q where q.id = quote_id and not q.is_example));

create policy "quote_lines: signed-in users update (not the example's)"
  on public.quote_lines for update to authenticated
  using (exists (select 1 from public.quotes q where q.id = quote_id and not q.is_example))
  with check (exists (select 1 from public.quotes q where q.id = quote_id and not q.is_example));

create policy "quote_lines: signed-in users delete (not the example's)"
  on public.quote_lines for delete to authenticated
  using (exists (select 1 from public.quotes q where q.id = quote_id and not q.is_example));

create policy "activity_log: signed-in users add their own rows"
  on public.activity_log for insert to authenticated
  with check (user_id = (select auth.uid()));

-- ---- The example quote guard ----------------------------------------------------------------------

-- RLS keeps app users away from the example quote; these triggers also stop roles that bypass RLS
-- (the service role, a direct connection). The one exception is the seed (scripts/seed-boxt.ts),
-- which creates and refreshes the example: it connects directly to Postgres and runs
-- `set local querent.seeding = 'on'` in its transaction. The switch counts only when the current role
-- is not an API role: PostgREST requests run as anon, authenticated or service_role, and have no way
-- to set the setting anyway, so no API call can turn the guard off.
create function private.example_writes_allowed()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(current_setting('querent.seeding', true), '') = 'on'
     and current_user not in ('anon', 'authenticated', 'service_role')
$$;

create function private.protect_example_quote()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not private.example_writes_allowed() then
    if tg_op in ('UPDATE', 'DELETE') then
      if old.is_example then
        raise exception 'The example quote cannot be changed or deleted.'
          using errcode = '42501', hint = 'example_quote';
      end if;
    end if;
    if tg_op in ('INSERT', 'UPDATE') then
      if new.is_example then
        raise exception 'Only the seed can create the example quote.'
          using errcode = '42501', hint = 'example_quote';
      end if;
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

create function private.protect_example_quote_lines()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  touched uuid[] := '{}';
begin
  if not private.example_writes_allowed() then
    if tg_op in ('UPDATE', 'DELETE') then
      touched := touched || old.quote_id;
    end if;
    if tg_op in ('INSERT', 'UPDATE') then
      touched := touched || new.quote_id;
    end if;
    if exists (select 1 from public.quotes q where q.id = any (touched) and q.is_example) then
      raise exception 'The example quote cannot be changed or deleted.'
        using errcode = '42501', hint = 'example_quote';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

create trigger quotes_protect_example
  before insert or update or delete on public.quotes
  for each row execute function private.protect_example_quote();

create trigger quote_lines_protect_example
  before insert or update or delete on public.quote_lines
  for each row execute function private.protect_example_quote_lines();

revoke all on function private.example_writes_allowed() from public, anon;
revoke all on function private.protect_example_quote() from public, anon;
revoke all on function private.protect_example_quote_lines() from public, anon;
grant execute on function private.example_writes_allowed() to authenticated, service_role;
grant execute on function private.protect_example_quote() to authenticated, service_role;
grant execute on function private.protect_example_quote_lines() to authenticated, service_role;
