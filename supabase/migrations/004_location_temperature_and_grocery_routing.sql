-- 004: Storage temperature on locations + grocery → location routing
-- Run in Supabase SQL Editor (or via `supabase db push`).

-- ── Locations: storage temperature ───────────────────────────────────────────
alter table public.inventory_locations
  add column if not exists temperature_type text
    check (temperature_type in ('frozen', 'refrigerated', 'cool', 'room')),
  add column if not exists temperature_c numeric;

-- Backfill sensible defaults for existing locations based on their name.
update public.inventory_locations
  set temperature_type = 'frozen'
  where temperature_type is null and name ilike '%freezer%';

update public.inventory_locations
  set temperature_type = 'refrigerated'
  where temperature_type is null and name ilike '%fridge%';

update public.inventory_locations
  set temperature_type = 'room'
  where temperature_type is null and name ~* 'pantry|cabinet|cupboard|cellar|counter|shelf';

-- ── Grocery items: target storage location ───────────────────────────────────
alter table public.grocery_items
  add column if not exists target_location_id uuid
    references public.inventory_locations(id) on delete set null;

-- ── Update create_household so new default locations carry a temperature ──────
create or replace function public.create_household(household_name text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
  invite text;
  result json;
begin
  invite := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 8));

  insert into public.households (name, invite_code)
  values (household_name, invite)
  returning id into new_id;

  insert into public.household_members (household_id, user_id, role)
  values (new_id, auth.uid(), 'owner');

  -- Default locations now include their storage temperature class.
  insert into public.inventory_locations (household_id, name, icon, temperature_type)
  values
    (new_id, 'Fridge', 'snow', 'refrigerated'),
    (new_id, 'Freezer', 'snow', 'frozen'),
    (new_id, 'Pantry', 'archive', 'room');

  select json_build_object(
    'id', h.id,
    'name', h.name,
    'invite_code', h.invite_code,
    'created_at', h.created_at
  ) into result
  from public.households h
  where h.id = new_id;

  return result;
end;
$$;
