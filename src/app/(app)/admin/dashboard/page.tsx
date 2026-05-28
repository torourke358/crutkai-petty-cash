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

  // Currency note: totals only make sense within one currency (no FX in v1).
  const currencies = [...new Set(data.map((r) => r.currency).filter(Boolean))];
  const currencyLabel = currencies.length === 1 ? currencies[0] : "mixed";

  // Aggregate spend by department + total + per-user in one pass.
  const deptTotals = new Map<string, number>();
  const userTotals = new Map<string, number>();
  let grandTotal = 0;

  for (const r of data) {
    const amt = Number(r.amount_total ?? 0);
    const deptId = r.department_id ?? "unassigned";
    deptTotals.set(deptId, (deptTotals.get(deptId) ?? 0) + amt);
    userTotals.set(r.user_id, (userTotals.get(r.user_id) ?? 0) + amt);
    grandTotal += amt;
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
    .map(([uid, total]) => ({ name: nameById.get(uid) ?? "Unknown", total }))
    .sort((a, b) => b.total - a.total);

  const deptRows = depts
    .map((d) => ({
      code: d.code,
      name: d.name,
      total: deptTotals.get(d.id) ?? 0,
    }))
    .sort((a, b) => b.total - a.total);
  const unassignedTotal = deptTotals.get("unassigned") ?? 0;

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
        <StatCard label="Total spend" value={money(grandTotal)} suffix={currencyLabel} />
        <StatCard label="Receipts" value={String(data.length)} />
      </div>

      {currencyLabel === "mixed" && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Receipts in this range span multiple currencies, so totals add
          different currencies together. Filter to one currency for an accurate
          total (v1 has no currency conversion).
        </p>
      )}

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
                  className="flex items-center justify-between p-3"
                >
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${departmentBadgeClass(
                      d.code,
                    )}`}
                  >
                    {d.name}
                  </span>
                  <span className="font-semibold tabular-nums text-slate-900">
                    {money(d.total)}{" "}
                    <span className="text-xs font-normal text-slate-400">
                      {currencyLabel}
                    </span>
                  </span>
                </li>
              ))}
              {unassignedTotal > 0 && (
                <li className="flex items-center justify-between p-3">
                  <span className="text-sm text-slate-500">Unassigned</span>
                  <span className="font-semibold tabular-nums text-slate-900">
                    {money(unassignedTotal)}{" "}
                    <span className="text-xs font-normal text-slate-400">
                      {currencyLabel}
                    </span>
                  </span>
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
              <li key={u.name} className="flex items-center justify-between p-3">
                <span className="font-medium text-slate-700">{u.name}</span>
                <span className="font-semibold tabular-nums text-slate-900">
                  {money(u.total)}{" "}
                  <span className="text-xs font-normal text-slate-400">
                    {currencyLabel}
                  </span>
                </span>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  suffix,
}: {
  label: string;
  value: string;
  suffix?: string;
}) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
        {value}
        {suffix && (
          <span className="ml-1 text-sm font-normal text-slate-400">
            {suffix}
          </span>
        )}
      </p>
    </div>
  );
}
