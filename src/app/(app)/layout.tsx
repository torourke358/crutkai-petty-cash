import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth";
import SignOutButton from "@/components/SignOutButton";

// Protected shell for every signed-in screen. Server component: redirects to
// /login when there's no session (the proxy does this too, but this guards
// direct server renders).
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const role = await getUserRole();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="safe-top sticky top-0 z-10 border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between px-4 py-3">
          <Link href="/receipts" className="font-semibold text-slate-900">
            Petty cash
          </Link>
          <div className="flex items-center gap-4">
            {role === "admin" && (
              <Link
                href="/admin/export"
                className="text-sm font-medium text-slate-500 hover:text-slate-900"
              >
                Export
              </Link>
            )}
            <span className="hidden max-w-[12rem] truncate text-sm text-slate-400 sm:inline">
              {user.email}
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-5">
        {children}
      </main>
    </div>
  );
}
