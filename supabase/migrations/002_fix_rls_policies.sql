-- Fix infinite recursion in RLS policies
-- Run this in Supabase SQL Editor

-- Step 1: Drop all existing policies
drop policy if exists "household members can view household" on public.households;
drop policy if exists "users can create households" on public.households;
drop policy if exists "users can update their household" on public.households;
drop policy if exists "household members can view members" on public.household_members;
drop policy if exists "users can join households" on public.household_members;
drop policy if exists "household members can manage locations" on public.inventory_locations;
drop policy if exists "household members can manage inventory" on public.inventory_items;
drop policy if exists "household members can manage grocery list" on public.grocery_items;
drop policy if exists "household members can manage waste log" on public.waste_log;

-- Step 2: Create a SECURITY DEFINER function
-- This bypasses RLS when called, preventing infinite recursion
create or replace function public.get_my_household_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select household_id from public.household_members where user_id = auth.uid();
$$;

-- Step 3: Re-create all policies using the function

-- Households
create policy "view own households" on public.households
  for select using (id in (select public.get_my_household_ids()));

create policy "create households" on public.households
  for insert with check (true);

create policy "update own households" on public.households
  for update using (id in (select public.get_my_household_ids()));

-- Household members (uses security definer fn — no recursion)
create policy "view household members" on public.household_members
  for select using (household_id in (select public.get_my_household_ids()));

create policy "join households" on public.household_members
  for insert with check (user_id = auth.uid());

create policy "leave households" on public.household_members
  for delete using (user_id = auth.uid());

-- Inventory locations
create policy "manage locations" on public.inventory_locations
  for all using (household_id in (select public.get_my_household_ids()));

-- Inventory items
create policy "manage inventory" on public.inventory_items
  for all using (household_id in (select public.get_my_household_ids()));

-- Grocery items
create policy "manage grocery list" on public.grocery_items
  for all using (household_id in (select public.get_my_household_ids()));

-- Waste log
create policy "manage waste log" on public.waste_log
  for all using (household_id in (select public.get_my_household_ids()));
