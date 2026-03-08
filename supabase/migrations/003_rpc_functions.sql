-- RPC: create_household
-- Handles household creation atomically, bypasses RLS catch-22
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
  -- Generate 8-char invite code
  invite := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 8));

  -- Create the household
  insert into public.households (name, invite_code)
  values (household_name, invite)
  returning id into new_id;

  -- Add creator as owner
  insert into public.household_members (household_id, user_id, role)
  values (new_id, auth.uid(), 'owner');

  -- Create default locations
  insert into public.inventory_locations (household_id, name, icon)
  values
    (new_id, 'Fridge', '🧊'),
    (new_id, 'Freezer', '❄️'),
    (new_id, 'Pantry', '🗄️');

  -- Return the full household record
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

-- RPC: join_household
-- Joins by invite code, bypasses RLS
create or replace function public.join_household(p_invite_code text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  target_id uuid;
  result json;
begin
  -- Find household by invite code
  select id into target_id
  from public.households
  where invite_code = upper(p_invite_code);

  if target_id is null then
    raise exception 'Invalid invite code';
  end if;

  -- Add member (ignore if already a member)
  insert into public.household_members (household_id, user_id, role)
  values (target_id, auth.uid(), 'member')
  on conflict (household_id, user_id) do nothing;

  -- Return the household record
  select json_build_object(
    'id', h.id,
    'name', h.name,
    'invite_code', h.invite_code,
    'created_at', h.created_at
  ) into result
  from public.households h
  where h.id = target_id;

  return result;
end;
$$;
