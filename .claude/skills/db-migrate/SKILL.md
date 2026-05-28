---
name: db-migrate
description: Run a SQL migration against the Crutkai petty cash Supabase project (ref trplphistdsfuecnnzdu) and verify it took. Use when applying a .sql file in the repo root (e.g. 07_round1.sql) or any ad-hoc DDL/data change.
disable-model-invocation: true
---

# db-migrate

Apply a SQL migration to the Crutkai petty cash Supabase project — **always** against project ref `trplphistdsfuecnnzdu`, never any other project — and verify the change took.

## When to use

- A `.sql` file in the repo root needs to be run (e.g. `07_round1.sql`).
- Ad-hoc DDL is needed (e.g. add/drop a column, create an index).
- A data fix needs to be applied (e.g. backfill, cleanup).

## Inputs

- A SQL file path **or** a SQL snippet.
- Optional: a one-line description for the commit/log message.

## Preferred path: Supabase MCP

If the `supabase` MCP server is connected (check by looking for `mcp__supabase__*` tools), use it. It is already scoped to project ref `trplphistdsfuecnnzdu` via the `--project-ref` flag in `.mcp.json`, so there is no risk of running against the wrong project.

1. Read the SQL.
2. Call `mcp__supabase__execute_sql` (or the equivalent) with the SQL text.
3. Verify the change with a follow-up query against the relevant table/column/function. Examples of verifications worth running:
   - **DDL on a column:** confirm the column exists / is nullable as expected.
   - **New table:** `select count(*) from <table>` returns 0 (or expected seed count).
   - **New function:** call it once with a representative input.
   - **Data backfill:** count rows matching the new state.

## Fallback (no Supabase MCP yet)

If the Supabase MCP is not connected, do **not** ask the user to paste SQL into the wrong project by mistake — instead:

1. Confirm the SQL is in a file under the repo root (write it there if not).
2. Print this exact instruction:

   > **Run the SQL in the project's SQL editor:**
   > https://supabase.com/dashboard/project/trplphistdsfuecnnzdu/sql/new
   > Paste the file `<path>` and Run.

3. After the user confirms it ran, verify via the REST API using the service-role key from `.env.local`:
   - For schema changes that affect a table, hit `https://trplphistdsfuecnnzdu.supabase.co/rest/v1/<table>?select=<col>&limit=1` and confirm a 200.
   - For new functions, POST to `/rest/v1/rpc/<fn_name>` with sample args.

## Safety rules

- **Project ref is hard-coded.** Never run against a different ref.
- For destructive operations (DROP, DELETE without WHERE, mass UPDATE), state what will change and require explicit confirmation before executing.
- Do **not** write `.env.local` or commit secrets.
- After the migration succeeds, leave the `.sql` file in place — it is the historical record.
