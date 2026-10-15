-- BOXT quote tool: create_quote and update_quote save a quote and its lines in one transaction.
-- docs/boxt/plan.md "Database". Both are SECURITY INVOKER: they run as the caller, so the caller's
-- grants, RLS and the example-quote guard all apply. Invalid input raises SQLSTATE 22023
-- (invalid_parameter_value) with a message naming the field (and the line, 1-based), and nothing is saved.
--
-- Payload (snake_case keys; unknown keys are refused):
--   customer_name   text, at most 200 characters (default '')
--   reference       text, at most 200 characters (default '')
--   match_strictness 'strict' | 'balanced' | 'lenient' (create only; default: org_settings)
--   lines           array of 1 to 200 line objects, stored in array order (position = index + 1):
--     original_text   required text, not blank, at most 2000 characters
--     unmatched       boolean (default false)
--     sku             text; required for a matched line, absent or null for an unmatched one
--     matched_by      'auto' | 'rep'; required for a matched line, absent or null for an unmatched one
--     description, pack, unit   text or null
--     quantity        number > 0, or null
--     unit_price      number >= 0, or null
--     list_price      number >= 0, or null (reference only)
--     quantity_unclear boolean (default false)
--     match_score     number or null
--     near_misses     array of at most 10 {sku, description, pack?, listPrice?, score?} (default [])

-- ---- Typed reads from a JSON object, with clear errors ----------------------------------------------

create function private.invalid(message text)
returns void
language plpgsql
volatile
set search_path = ''
as $$
begin
  raise exception '%', message using errcode = '22023';
end
$$;

create function private.json_text(obj jsonb, key text, max_length integer, label text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v jsonb := obj -> key;
begin
  if v is null or jsonb_typeof(v) = 'null' then
    return null;
  end if;
  if jsonb_typeof(v) <> 'string' then
    perform private.invalid(format('%s%s must be text', label, key));
  end if;
  if char_length(v #>> '{}') > max_length then
    perform private.invalid(format('%s%s is longer than %s characters', label, key, max_length));
  end if;
  return v #>> '{}';
end
$$;

create function private.json_number(obj jsonb, key text, label text)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  v jsonb := obj -> key;
begin
  if v is null or jsonb_typeof(v) = 'null' then
    return null;
  end if;
  if jsonb_typeof(v) <> 'number' then
    perform private.invalid(format('%s%s must be a number', label, key));
  end if;
  return (v #>> '{}')::numeric;
end
$$;

create function private.json_bool(obj jsonb, key text, fallback boolean, label text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v jsonb := obj -> key;
begin
  if v is null or jsonb_typeof(v) = 'null' then
    return fallback;
  end if;
  if jsonb_typeof(v) <> 'boolean' then
    perform private.invalid(format('%s%s must be true or false', label, key));
  end if;
  return (v #>> '{}')::boolean;
end
$$;

create function private.check_keys(obj jsonb, allowed text[], label text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  extra text;
begin
  select k into extra from jsonb_object_keys(obj) as k where not (k = any (allowed)) order by k limit 1;
  if extra is not null then
    perform private.invalid(format('%sunknown field %s', label, extra));
  end if;
end
$$;

-- ---- Lines -------------------------------------------------------------------------------------------

-- Validates `lines` and inserts them for `target` (as the caller). Returns the number of lines.
create function private.insert_quote_lines(target uuid, lines jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  line jsonb;
  near jsonb;
  n integer := 0;
  label text;
  v_unmatched boolean;
  v_sku text;
  v_matched_by text;
  v_original text;
  v_quantity numeric;
  v_unit_price numeric;
  v_list_price numeric;
  v_near jsonb;
  m integer;
begin
  if lines is null or jsonb_typeof(lines) <> 'array' then
    perform private.invalid('lines must be an array');
  end if;
  if jsonb_array_length(lines) = 0 then
    perform private.invalid('a quote needs at least one line');
  end if;
  if jsonb_array_length(lines) > 200 then
    perform private.invalid('a quote has at most 200 lines');
  end if;

  for line in select value from jsonb_array_elements(lines) loop
    n := n + 1;
    label := format('line %s: ', n);
    if jsonb_typeof(line) <> 'object' then
      perform private.invalid(format('line %s must be an object', n));
    end if;
    perform private.check_keys(line, array[
      'original_text', 'unmatched', 'sku', 'matched_by', 'description', 'pack', 'unit', 'quantity',
      'unit_price', 'list_price', 'quantity_unclear', 'match_score', 'near_misses'
    ], label);

    v_original := private.json_text(line, 'original_text', 2000, label);
    if v_original is null or btrim(v_original) = '' then
      perform private.invalid(label || 'original_text is required');
    end if;

    v_unmatched := private.json_bool(line, 'unmatched', false, label);
    v_sku := nullif(btrim(private.json_text(line, 'sku', 64, label)), '');
    v_matched_by := private.json_text(line, 'matched_by', 4, label);
    if v_matched_by is not null and v_matched_by not in ('auto', 'rep') then
      perform private.invalid(label || 'matched_by must be auto or rep');
    end if;
    if v_unmatched then
      if v_matched_by is not null then
        perform private.invalid(label || 'an unmatched line has no matched_by');
      end if;
      if v_sku is not null then
        perform private.invalid(label || 'an unmatched line has no sku');
      end if;
    else
      if v_sku is null then
        perform private.invalid(label || 'a matched line needs a sku');
      end if;
      if v_matched_by is null then
        perform private.invalid(label || 'a matched line needs matched_by (auto or rep)');
      end if;
    end if;

    v_quantity := private.json_number(line, 'quantity', label);
    if v_quantity is not null and (v_quantity <= 0 or v_quantity >= 100000000000) then
      perform private.invalid(label || 'quantity must be greater than 0');
    end if;
    v_unit_price := private.json_number(line, 'unit_price', label);
    if v_unit_price is not null and (v_unit_price < 0 or v_unit_price >= 100000000) then
      perform private.invalid(label || 'unit_price must be 0 or more');
    end if;
    v_list_price := private.json_number(line, 'list_price', label);
    if v_list_price is not null and (v_list_price < 0 or v_list_price >= 10000000000) then
      perform private.invalid(label || 'list_price must be 0 or more');
    end if;

    -- Near-misses: kept as a snapshot of the candidates, normalized to the five known fields.
    v_near := coalesce(line -> 'near_misses', '[]'::jsonb);
    if jsonb_typeof(v_near) = 'null' then
      v_near := '[]'::jsonb;
    end if;
    if jsonb_typeof(v_near) <> 'array' then
      perform private.invalid(label || 'near_misses must be an array');
    end if;
    if jsonb_array_length(v_near) > 10 then
      perform private.invalid(label || 'near_misses has at most 10 entries');
    end if;
    m := 0;
    for near in select value from jsonb_array_elements(v_near) loop
      m := m + 1;
      if jsonb_typeof(near) <> 'object' then
        perform private.invalid(format('%snear_misses[%s] must be an object', label, m));
      end if;
      if nullif(btrim(private.json_text(near, 'sku', 64, format('%snear_misses[%s].', label, m))), '') is null
         or private.json_text(near, 'description', 500, format('%snear_misses[%s].', label, m)) is null then
        perform private.invalid(format('%snear_misses[%s] needs a sku and a description', label, m));
      end if;
      perform private.json_text(near, 'pack', 100, format('%snear_misses[%s].', label, m));
      perform private.json_number(near, 'listPrice', format('%snear_misses[%s].', label, m));
      perform private.json_number(near, 'score', format('%snear_misses[%s].', label, m));
    end loop;
    select coalesce(jsonb_agg(jsonb_build_object(
             'sku', e ->> 'sku',
             'description', e ->> 'description',
             'pack', coalesce(e -> 'pack', 'null'::jsonb),
             'listPrice', coalesce(e -> 'listPrice', 'null'::jsonb),
             'score', coalesce(e -> 'score', 'null'::jsonb)
           ) order by ord), '[]'::jsonb)
      into v_near
      from jsonb_array_elements(v_near) with ordinality as t(e, ord);

    insert into public.quote_lines (
      quote_id, position, sku, description, pack, list_price, quantity, unit, quantity_unclear,
      unit_price, matched_by, original_text, unmatched, match_score, near_misses
    ) values (
      target,
      n,
      v_sku,
      private.json_text(line, 'description', 500, label),
      private.json_text(line, 'pack', 100, label),
      v_list_price,
      v_quantity,
      private.json_text(line, 'unit', 40, label),
      private.json_bool(line, 'quantity_unclear', false, label),
      v_unit_price,
      v_matched_by,
      v_original,
      v_unmatched,
      private.json_number(line, 'match_score', label),
      v_near
    );
  end loop;
  return n;
end
$$;

-- ---- The quote functions -------------------------------------------------------------------------

-- Creates a quote and its lines; returns the new quote's id.
create function public.create_quote(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_strictness text;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    perform private.invalid('payload must be an object');
  end if;
  perform private.check_keys(payload, array['customer_name', 'reference', 'match_strictness', 'lines'], '');

  v_strictness := private.json_text(payload, 'match_strictness', 16, '');
  if v_strictness is null then
    select s.match_strictness into v_strictness from public.org_settings s where s.id = 1;
  elsif v_strictness not in ('strict', 'balanced', 'lenient') then
    perform private.invalid('match_strictness must be strict, balanced or lenient');
  end if;

  insert into public.quotes (customer_name, reference, match_strictness)
  values (
    coalesce(btrim(private.json_text(payload, 'customer_name', 200, '')), ''),
    coalesce(btrim(private.json_text(payload, 'reference', 200, '')), ''),
    coalesce(v_strictness, 'strict')
  )
  returning id into v_id;

  perform private.insert_quote_lines(v_id, payload -> 'lines');
  return v_id;
end
$$;

-- Changes a quote: customer_name and reference when present; when `lines` is present it replaces all
-- of the quote's lines. Unknown quote: SQLSTATE P0002 (hint not_found). The example quote: 42501
-- (hint example_quote).
create function public.update_quote(quote_id uuid, payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_example boolean;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    perform private.invalid('payload must be an object');
  end if;
  perform private.check_keys(payload, array['customer_name', 'reference', 'lines'], '');

  select q.is_example into v_example from public.quotes q where q.id = update_quote.quote_id;
  if not found then
    raise exception 'Quote not found.' using errcode = 'P0002', hint = 'not_found';
  end if;
  if v_example then
    raise exception 'The example quote cannot be changed or deleted.' using errcode = '42501', hint = 'example_quote';
  end if;

  update public.quotes q
     set customer_name = case when payload ? 'customer_name'
                              then coalesce(btrim(private.json_text(payload, 'customer_name', 200, '')), '')
                              else q.customer_name end,
         reference = case when payload ? 'reference'
                          then coalesce(btrim(private.json_text(payload, 'reference', 200, '')), '')
                          else q.reference end
   where q.id = update_quote.quote_id;

  if payload ? 'lines' then
    delete from public.quote_lines l where l.quote_id = update_quote.quote_id;
    perform private.insert_quote_lines(update_quote.quote_id, payload -> 'lines');
  end if;
  return update_quote.quote_id;
end
$$;

revoke all on function private.invalid(text) from public, anon;
revoke all on function private.json_text(jsonb, text, integer, text) from public, anon;
revoke all on function private.json_number(jsonb, text, text) from public, anon;
revoke all on function private.json_bool(jsonb, text, boolean, text) from public, anon;
revoke all on function private.check_keys(jsonb, text[], text) from public, anon;
revoke all on function private.insert_quote_lines(uuid, jsonb) from public, anon;
revoke all on function public.create_quote(jsonb) from public, anon;
revoke all on function public.update_quote(uuid, jsonb) from public, anon;

grant execute on function private.invalid(text) to authenticated, service_role;
grant execute on function private.json_text(jsonb, text, integer, text) to authenticated, service_role;
grant execute on function private.json_number(jsonb, text, text) to authenticated, service_role;
grant execute on function private.json_bool(jsonb, text, boolean, text) to authenticated, service_role;
grant execute on function private.check_keys(jsonb, text[], text) to authenticated, service_role;
grant execute on function private.insert_quote_lines(uuid, jsonb) to authenticated, service_role;
grant execute on function public.create_quote(jsonb) to authenticated, service_role;
grant execute on function public.update_quote(uuid, jsonb) to authenticated, service_role;
