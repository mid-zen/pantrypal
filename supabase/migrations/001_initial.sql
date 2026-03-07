-- Households
create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text unique not null,
  created_at timestamptz default now()
);

-- Household members
create table public.household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text default 'member',
  joined_at timestamptz default now(),
  unique(household_id, user_id)
);

-- Inventory locations
create table public.inventory_locations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households(id) on delete cascade,
  name text not null,
  icon text,
  created_at timestamptz default now()
);

-- Inventory items
create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households(id) on delete cascade,
  location_id uuid references public.inventory_locations(id) on delete set null,
  name text not null,
  quantity numeric default 1,
  unit text,
  barcode text,
  category text,
  date_added date default current_date,
  best_before date,
  expiry_date date,
  notes text,
  added_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Grocery list items
create table public.grocery_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households(id) on delete cascade,
  name text not null,
  quantity numeric default 1,
  unit text,
  category text,
  checked boolean default false,
  checked_at timestamptz,
  added_by uuid references auth.users(id),
  created_at timestamptz default now()
);

-- Waste log
create table public.waste_log (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households(id) on delete cascade,
  item_name text not null,
  quantity numeric default 1,
  unit text,
  category text,
  estimated_value numeric,
  reason text,
  logged_at timestamptz default now()
);

-- Enable Row Level Security
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.inventory_locations enable row level security;
alter table public.inventory_items enable row level security;
alter table public.grocery_items enable row level security;
alter table public.waste_log enable row level security;

-- RLS Policies: users can only see data for their household
create policy "household members can view household" on public.households
  for select using (
    id in (select household_id from public.household_members where user_id = auth.uid())
  );

create policy "household members can view members" on public.household_members
  for select using (
    household_id in (select household_id from public.household_members where user_id = auth.uid())
  );

create policy "household members can manage locations" on public.inventory_locations
  for all using (
    household_id in (select household_id from public.household_members where user_id = auth.uid())
  );

create policy "household members can manage inventory" on public.inventory_items
  for all using (
    household_id in (select household_id from public.household_members where user_id = auth.uid())
  );

create policy "household members can manage grocery list" on public.grocery_items
  for all using (
    household_id in (select household_id from public.household_members where user_id = auth.uid())
  );

create policy "household members can manage waste log" on public.waste_log
  for all using (
    household_id in (select household_id from public.household_members where user_id = auth.uid())
  );

-- Insert policies
create policy "users can create households" on public.households
  for insert with check (true);

create policy "users can join households" on public.household_members
  for insert with check (user_id = auth.uid());
