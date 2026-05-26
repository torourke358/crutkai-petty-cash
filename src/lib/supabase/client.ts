import { createBrowserClient } from "@supabase/ssr";

// Browser-side Supabase client. Safe to call from client components.
// Uses the anon key and respects RLS via the user's session cookie.
export function createClient() {
  // .trim() guards against a stray newline/space pasted into the env value,
  // which would otherwise make fetch throw "Invalid value" on the auth header.
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim(),
  );
}
