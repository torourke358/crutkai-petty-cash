-- ============================================
-- Petty Cash App — receipt categories
-- Run in: Supabase SQL Editor (project ref trplphistdsfuecnnzdu).
-- Adds a `category` column for filter-chip search on the receipts list.
-- All existing rows default to 'other' — re-categorize them in the UI.
-- Safe to re-run.
-- ============================================

alter table receipts add column if not exists category text not null default 'other';

-- Drop and re-add the check so adding new categories later just needs one edit.
alter table receipts drop constraint if exists receipts_category_check;
alter table receipts add constraint receipts_category_check
  check (category in (
    'restaurant', 'groceries', 'fuel', 'supplies',
    'hardware', 'services', 'other'
  ));

create index if not exists idx_receipts_category on receipts (category);
