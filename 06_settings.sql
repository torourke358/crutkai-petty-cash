-- ============================================
-- Petty Cash App — Migration: app settings (admin-editable AI guidance)
-- Run in: Supabase Dashboard → SQL Editor → New Query
-- Make sure the editor is on project ref `trplphistdsfuecnnzdu`.
-- Safe to re-run.
-- ============================================

create table if not exists app_settings (
  key        text primary key,
  value      text,
  updated_at timestamptz default now()
);

alter table app_settings enable row level security;

drop policy if exists "Anyone reads settings" on app_settings;
create policy "Anyone reads settings" on app_settings
  for select using (true);

drop policy if exists "Admin manages settings" on app_settings;
create policy "Admin manages settings" on app_settings
  for all using (is_admin());

-- The notes_instruction row is created the first time an admin saves it from
-- /admin/ai-notes; until then the app uses its built-in default.
