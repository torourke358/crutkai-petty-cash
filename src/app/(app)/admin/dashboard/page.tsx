import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth";
import type { Department } from "@/lib/types";

export const dynamic = "force-dynamic";

interface Row {
  user_id: string;
  amount_total: number | null;
  currency: string;
  department_id: string | null;
  client_id: string | null;
  department: { name: string } | null;
  client: { name: string; is_overhead: boolean } | null;
}

function monthStart(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function today(): string {
  return new Date().toISOString().slice(0, 10);
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
  const from = sp.from || monthStart();
  const to = sp.to || today();

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
        "user_id, amount_total, currency, department_id, client_id, department:departments(name), client:clients(name, is_overhead)",
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

  // Client × Department matrix.
  const UNASSIGNED = "Unassigned";
  type ClientAgg = {
    name: string;
    isOverhead: boolean;
    byDept: Record<string, number>;
    total: number;
  };
  const clientMap = new Map<string, ClientAgg>();
  const deptTotals: Record<string, number> = {};
  let grandTotal = 0;

  for (const r of data) {
    const amt = Number(r.amount_total ?? 0);
    const clientName = r.client?.name ?? UNASSIGNED;
    const deptName = r.department?.name ?? UNASSIGNED;

    if (!clientMap.has(clientName)) {
      clientMap.set(clientName, {
        name: clientName,
        isOverhead: r.client?.is_overhead ?? false,
        byDept: {},
        total: 0,
      });
    }
    const agg = clientMap.get(clientName)!;
    agg.byDept[deptName] = (agg.byDept[deptName] ?? 0) + amt;
    agg.total += amt;
    deptTotals[deptName] = (deptTotals[deptName] ?? 0) + amt;
    grandTotal += amt;
  }

  const clientRows = [...clientMap.values()].sort((a, b) => {
    if (a.isOverhead !== b.isOverhead) return a.isOverhead ? 1 : -1; // overhead last
    return b.total - a.total;
  });

  const billable = clientRows
    .filter((c) => !c.isOverhead && c.name !== UNASSIGNED)
    .reduce((s, c) => s + c.total, 0);
  const overhead = clientRows
    .filter((c) => c.isOverhead)
    .reduce((s, c) => s + c.total, 0);

  // By crew member.
  const userTotals = new Map<string, number>();
  for (const r of data) {
    userTotals.set(
      r.user_id,
      (userTotals.get(r.user_id) ?? 0) + Number(r.amount_total ?? 0),
    );
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

  const colTotal = (name: string) => deptTotals[name] ?? 0;

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
        <StatCard label="Billable to clients" value={money(billable)} suffix={currencyLabel} />
        <StatCard label="Overhead" value={money(overhead)} suffix={currencyLabel} />
      </div>

      {currencyLabel === "mixed" && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Receipts in this range span multiple currencies, so totals add
          different currencies together. Filter to one currency for an accurate
          total (v1 has no currency conversion).
        </p>
      )}

      {/* Client × Department matrix */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-900">
          By client &amp; department
        </h2>
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="w-full min-w-[640px] border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="sticky left-0 bg-background py-2 pr-3 font-medium">
                  Client
                </th>
                {depts.map((d) => (
                  <th key={d.id} className="px-3 py-2 text-right font-medium">
                    {d.name}
                  </th>
                ))}
                <th className="px-3 py-2 text-right font-semibold text-slate-700">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {clientRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={depts.length + 2}
                    className="py-6 text-center text-slate-400"
                  >
                    No receipts in this range.
                  </td>
                </tr>
              ) : (
                clientRows.map((c) => (
                  <tr key={c.name} className="border-t border-slate-100">
                    <td className="sticky left-0 bg-white py-2 pr-3 font-medium text-slate-900">
                      {c.name}
                      {c.isOverhead && (
                        <span className="ml-1 text-xs text-slate-400">
                          (overhead)
                        </span>
                      )}
                    </td>
                    {depts.map((d) => (
                      <td key={d.id} className="px-3 py-2 text-right tabular-nums text-slate-600">
                        {c.byDept[d.name] ? money(c.byDept[d.name]) : "—"}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-900">
                      {money(c.total)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {clientRows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-slate-200">
                  <td className="sticky left-0 bg-background py-2 pr-3 font-semibold text-slate-900">
                    Total
                  </td>
                  {depts.map((d) => (
                    <td key={d.id} className="px-3 py-2 text-right font-semibold tabular-nums text-slate-700">
                      {colTotal(d.name) ? money(colTotal(d.name)) : "—"}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right font-bold tabular-nums text-slate-900">
                    {money(grandTotal)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
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
