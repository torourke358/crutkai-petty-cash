-- ============================================
-- Petty Cash App — Round 1 schema change
-- Run in: Supabase SQL Editor (project ref trplphistdsfuecnnzdu).
-- The data changes (Tips/Bridge, null client_id) were already applied via the
-- API; this file covers the parts that require DDL.
-- Safe to re-run.
-- ============================================

-- Required for manual receipt entry (cash payments with no receipt/photo).
alter table receipts alter column image_path drop not null;

-- Optional: trigram indexes to speed up vendor/notes search if it ever grows
-- beyond client-side filtering. Harmless to include now.
create extension if not exists pg_trgm;
create index if not exists idx_receipts_vendor_trgm
  on receipts using gin (vendor gin_trgm_ops);
create index if not exists idx_receipts_notes_trgm
  on receipts using gin (notes gin_trgm_ops);
