-- BOXT quote tool (task B10): a quote line keeps the customer's quantity as they wrote it
-- (customer_quantity, e.g. "10 pallets" or "10 bundles") when the dialog converted it into the item's
-- pricing unit or could not (quantity_unclear), so the quote's page can still say what the customer
-- asked for after save. Text only, at most 100 characters; null when the customer's quantity was used
-- as it stood. create_quote / update_quote accept it as the line key customer_quantity.

alter table public.quote_lines
  add column customer_quantity text,
  add constraint quote_lines_customer_quantity_length check (char_length(customer_quantity) <= 100);

grant insert (customer_quantity) on public.quote_lines to authenticated;
grant update (customer_quantity) on public.quote_lines to authenticated;

-- The line writer of *_boxt_quote_rpcs.sql, with the new key (unchanged otherwise; its grants stay).

-- Validates `lines` and inserts them for `target` (as the caller). Returns the number of lines.
create or replace function private.insert_quote_lines(target uuid, lines jsonb)
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
      'unit_price', 'list_price', 'quantity_unclear', 'customer_quantity', 'match_score', 'near_misses'
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
      customer_quantity, unit_price, matched_by, original_text, unmatched, match_score, near_misses
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
      private.json_text(line, 'customer_quantity', 100, label),
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
