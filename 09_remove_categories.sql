-- ============================================
-- Petty Cash App — remove the receipt categories feature
-- Run in: Supabase SQL Editor (project ref trplphistdsfuecnnzdu).
-- Reverses 08_categories.sql. Captain decided categories weren't needed.
-- Safe to re-run.
-- ============================================

alter table receipts drop constraint if exists receipts_category_check;
drop index if exists idx_receipts_category;
alter table receipts drop column if exists category;
