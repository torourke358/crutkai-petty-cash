import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth";
import { monthStartLocal, todayLocal } from "@/lib/format";
import { departmentBadgeClass } from "@/lib/departments";
import type { Department } from "@/lib/types";

export const dynamic = "force-dynamic";

interface Row {
  user_id: string;
  amount_total: number | null;
  currency: string;
  department_id: string | null;
  department: { code: string; name: string } | null;
}

function money(n: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

const inputClass =
  "mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200";

// One row of "amount currency" lines (stacked) — used on every spend cell so
// mixed-currency totals show each currency on its own line instead of adding
// them together.
function CurrencyTotals({ amounts }: { amounts: Map<string, number> }) {
  const entries = [...amounts.entries()].sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) {
    return <span className="text-slate-300">—</span>;
  }
  return (
    <span className="flex flex-col items-end gap-0.5">
      {entries.map(([cur, amt]) => (
        <span key={cur} className="font-semibold tabular-nums text-slate-900">
          {money(amt)}{" "}
          <span className="text-xs font-normal text-slate-400">{cur}</span>
        </span>
      ))}
    </span>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  if ((await getUserRole()) !== "admin") redirect("/receipts");

  const sp = await searchParams;
  const from = sp.from || monthStartLocal();
  const to = sp.to || todayLocal();

  const supabase = await createClient();

  const [{ data: departments }, { data: rows }] = await Promise.all([
    supabase
      .from("departments")
      .select("id, code, name, display_order, active")
      .eq("active", true)
      .order("display_order")
      .returns<Department[]>(),
    supabase
      .from("receipts")
      .select(
        "user_id, amount_total, currency, department_id, department:departments(code, name)",
      )
      .gte("receipt_date", from)
      .lte("receipt_date", to)
      .returns<Row[]>(),
  ]);

  const depts = departments ?? [];
  const data = rows ?? [];

  // Aggregate as currency -> amount Maps everywhere so the UI can render each
  // currency on its own line and nothing gets summed across currencies.
  const grandTotal = new Map<string, number>();
  const deptTotals = new Map<string, Map<string, number>>();
  const userTotals = new Map<string, Map<string, number>>();

  function bump(m: Map<string, number>, cur: string, amt: number) {
    m.set(cur, (m.get(cur) ?? 0) + amt);
  }
  function getOrInit(
    m: Map<string, Map<string, number>>,
    key: string,
  ): Map<string, number> {
    let inner = m.get(key);
    if (!inner) {
      inner = new Map();
      m.set(key, inner);
    }
    return inner;
  }

  for (const r of data) {
    const cur = r.currency || "USD";
    const amt = Number(r.amount_total ?? 0);
    const deptId = r.department_id ?? "unassigned";
    bump(grandTotal, cur, amt);
    bump(getOrInit(deptTotals, deptId), cur, amt);
    bump(getOrInit(userTotals, r.user_id), cur, amt);
  }

  // Sort helper: rank rows by the sum of their absolute amounts (mixing
  // currencies for sort order only — display stays separated).
  function rank(amounts: Map<string, number> | undefined): number {
    if (!amounts) return 0;
    let n = 0;
    for (const v of amounts.values()) n += Math.abs(v);
    return n;
  }

  const userIds = [...userTotals.keys()];
  const { data: profiles } = await supabase
    .from("user_profiles")
    .select("id, full_name")
    .in("id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);
  const nameById = new Map(
    (profiles ?? []).map((p) => [p.id, p.full_name] as const),
  );
  const crewRows = [...userTotals.entries()]
    .map(([uid, amounts]) => ({
      name: nameById.get(uid) ?? "Unknown",
      amounts,
    }))
    .sort((a, b) => rank(b.amounts) - rank(a.amounts));

  const deptRows = depts
    .map((d) => ({
      code: d.code,
      name: d.name,
      amounts: deptTotals.get(d.id) ?? new Map<string, number>(),
    }))
    .sort((a, b) => rank(b.amounts) - rank(a.amounts));
  const unassignedAmounts = deptTotals.get("unassigned");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Dashboard</h1>
        <Link href="/receipts" className="text-sm text-slate-500">
          Back
        </Link>
      </div>

      {/* Date range (plain GET form — no JS needed) */}
      <form className="flex items-end gap-3">
        <div className="flex-1">
          <label htmlFor="from" className="text-sm font-medium text-slate-700">
            From
          </label>
          <input id="from" name="from" type="date" defaultValue={from} className={inputClass} />
        </div>
        <div className="flex-1">
          <label htmlFor="to" className="text-sm font-medium text-slate-700">
            To
          </label>
          <input id="to" name="to" type="date" defaultValue={to} className={inputClass} />
        </div>
        <button
          type="submit"
          className="rounded-xl bg-violet-600 px-5 py-2 text-sm font-medium text-white active:bg-violet-700"
        >
          Apply
        </button>
      </form>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3">
        <TotalCard amounts={grandTotal} />
        <StatCard label="Receipts" value={String(data.length)} />
      </div>

      {/* By department */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-900">By department</h2>
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-100">
          {deptRows.length === 0 ? (
            <li className="p-4 text-center text-slate-400">
              No receipts in this range.
            </li>
          ) : (
            <>
              {deptRows.map((d) => (
                <li
                  key={d.code}
                  className="flex items-center justify-between gap-3 p-3"
                >
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${departmentBadgeClass(
                      d.code,
                    )}`}
                  >
                    {d.name}
                  </span>
                  <CurrencyTotals amounts={d.amounts} />
                </li>
              ))}
              {unassignedAmounts && unassignedAmounts.size > 0 && (
                <li className="flex items-center justify-between gap-3 p-3">
                  <span className="text-sm text-slate-500">Unassigned</span>
                  <CurrencyTotals amounts={unassignedAmounts} />
                </li>
              )}
            </>
          )}
        </ul>
      </section>

      {/* By crew member */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-900">By crew member</h2>
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-100">
          {crewRows.length === 0 ? (
            <li className="p-4 text-center text-slate-400">No receipts.</li>
          ) : (
            crewRows.map((u) => (
              <li
                key={u.name}
                className="flex items-center justify-between gap-3 p-3"
              >
                <span className="font-medium text-slate-700">{u.name}</span>
                <CurrencyTotals amounts={u.amounts} />
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}

function TotalCard({ amounts }: { amounts: Map<string, number> }) {
  const entries = [...amounts.entries()].sort((a, b) => b[1] - a[1]);
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
        Total spend
      </p>
      {entries.length === 0 ? (
        <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
          0.00
        </p>
      ) : (
        <div className="mt-1 space-y-0.5">
          {entries.map(([cur, amt]) => (
            <p
              key={cur}
              className="text-2xl font-semibold leading-tight tabular-nums text-slate-900"
            >
              {money(amt)}
              <span className="ml-1 text-sm font-normal text-slate-400">
                {cur}
              </span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
        {value}
      </p>
    </div>
  );
}
