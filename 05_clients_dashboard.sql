-- ============================================
-- Petty Cash App — Migration: clients + vendor learning
-- Run in: Supabase Dashboard → SQL Editor → New Query
-- Safe to re-run (uses if-not-exists / on-conflict guards).
-- ============================================

-- --------------------------------------------
-- 1. Clients (who an expense is billed to)
-- --------------------------------------------
create table if not exists clients (
  id            uuid primary key default uuid_generate_v4(),
  name          text not null,
  is_overhead   boolean default false,   -- the non-billable "ship eats it" bucket
  active        boolean default true,
  display_order int default 0,
  created_at    timestamptz default now()
);

-- Seed the Overhead bucket once. All other clients are added in-app.
insert into clients (name, is_overhead, display_order)
select 'Overhead', true, 0
where not exists (select 1 from clients where is_overhead = true);

-- --------------------------------------------
-- 2. Link receipts to a client
-- --------------------------------------------
alter table receipts
  add column if not exists client_id uuid references clients(id);

create index if not exists idx_receipts_client_id on receipts(client_id);

-- --------------------------------------------
-- 3. Vendor → department learning
-- Returns the department most recently used for a given vendor, across ALL
-- crew (security definer bypasses RLS so coding stays consistent for everyone).
-- --------------------------------------------
create or replace function vendor_default_department(p_vendor text)
returns uuid
language sql
security definer
stable
as $$
  select department_id
  from receipts
  where department_id is not null
    and p_vendor is not null
    and lower(btrim(vendor)) = lower(btrim(p_vendor))
  order by created_at desc
  limit 1;
$$;

grant execute on function vendor_default_department(text) to authenticated;

-- --------------------------------------------
-- 4. Row Level Security for clients
-- --------------------------------------------
alter table clients enable row level security;

drop policy if exists "Anyone reads clients" on clients;
create policy "Anyone reads clients" on clients
  for select using (true);

drop policy if exists "Admin manages clients" on clients;
create policy "Admin manages clients" on clients
  for all using (is_admin());

-- --------------------------------------------
-- DONE
-- --------------------------------------------
