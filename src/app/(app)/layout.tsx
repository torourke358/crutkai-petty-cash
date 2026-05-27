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
      <header className="safe-top sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between px-4 py-3">
          <Link
            href="/receipts"
            className="flex items-center gap-2 font-semibold text-slate-900"
          >
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-violet-600 text-sm font-bold text-white">
              $
            </span>
            Petty cash
          </Link>
          <div className="flex items-center gap-4">
            {role === "admin" && (
              <>
                <Link
                  href="/admin/dashboard"
                  className="text-sm font-medium text-slate-500 hover:text-violet-700"
                >
                  Dashboard
                </Link>
                <Link
                  href="/admin/clients"
                  className="hidden text-sm font-medium text-slate-500 hover:text-violet-700 sm:inline"
                >
                  Clients
                </Link>
                <Link
                  href="/admin/export"
                  className="text-sm font-medium text-slate-500 hover:text-violet-700"
                >
                  Export
                </Link>
              </>
            )}
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
