"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Department, Client } from "@/lib/types";
import { departmentBadgeClass } from "@/lib/departments";
import { formatAmount, formatDate } from "@/lib/format";

export interface ReceiptCard {
  id: string;
  vendor: string | null;
  amount_total: number | null;
  currency: string;
  receipt_date: string | null;
  departmentId: string | null;
  departmentCode: string | null;
  departmentName: string | null;
  thumbnailUrl: string | null;
  uploaderName: string | null;
}

export default function ReceiptsList({
  cards,
  departments,
  clients,
  isAdmin,
}: {
  cards: ReceiptCard[];
  departments: Department[];
  clients: Client[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<string | "all">("all");
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reassignTo, setReassignTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visible = useMemo(
    () =>
      filter === "all" ? cards : cards.filter((c) => c.departmentId === filter),
    [cards, filter],
  );

  const chips = [{ id: "all" as const, name: "All" }, ...departments];

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitSelect() {
    setSelectMode(false);
    setSelected(new Set());
    setReassignTo("");
    setError(null);
  }

  // Run a request for each selected id; reuses the per-receipt API (which also
  // writes audit-log entries). Fine for the modest volumes here.
  async function runBulk(
    fn: (id: string) => Promise<Response>,
    failMsg: string,
  ) {
    setBusy(true);
    setError(null);
    const ids = [...selected];
    const results = await Promise.all(ids.map((id) => fn(id).catch(() => null)));
    setBusy(false);

    const failed = results.filter((r) => !r || !r.ok).length;
    if (failed > 0) {
      setError(`${failMsg} (${failed} of ${ids.length} failed)`);
      return;
    }
    exitSelect();
    router.refresh();
  }

  function reassign() {
    if (!reassignTo) {
      setError("Choose a client to reassign to.");
      return;
    }
    runBulk(
      (id) =>
        fetch(`/api/receipts/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ client_id: reassignTo }),
        }),
      "Some receipts couldn't be reassigned",
    );
  }

  function remove() {
    if (!confirm(`Delete ${selected.size} receipt(s)? This can't be undone.`)) {
      return;
    }
    runBulk(
      (id) => fetch(`/api/receipts/${id}`, { method: "DELETE" }),
      "Some receipts couldn't be deleted",
    );
  }

  return (
    <div className="relative">
      {/* Toolbar: filter chips + select toggle */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="-ml-1 flex flex-1 gap-2 overflow-x-auto px-1 pb-1">
          {chips.map((chip) => {
            const active = filter === chip.id;
            return (
              <button
                key={chip.id}
                onClick={() => setFilter(chip.id)}
                className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-violet-600 text-white"
                    : "bg-white text-slate-600 ring-1 ring-slate-200"
                }`}
              >
                {chip.name}
              </button>
            );
          })}
        </div>
        {cards.length > 0 && (
          <button
            onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
            className="shrink-0 text-sm font-medium text-violet-700"
          >
            {selectMode ? "Cancel" : "Select"}
          </button>
        )}
      </div>

      {/* Bulk action bar */}
      {selectMode && (
        <div className="sticky top-16 z-10 mb-3 space-y-2 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
          <p className="text-sm font-medium text-slate-700">
            {selected.size} selected
          </p>
          <div className="flex gap-2">
            <select
              value={reassignTo}
              onChange={(e) => setReassignTo(e.target.value)}
              className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
            >
              <option value="">Reassign to client…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              onClick={reassign}
              disabled={busy || selected.size === 0 || !reassignTo}
              className="shrink-0 rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white active:bg-violet-700 disabled:opacity-50"
            >
              Reassign
            </button>
          </div>
          {isAdmin && (
            <button
              onClick={remove}
              disabled={busy || selected.size === 0}
              className="w-full rounded-xl border border-rose-200 px-4 py-2 text-sm font-medium text-rose-600 active:bg-rose-50 disabled:opacity-50"
            >
              Delete selected
            </button>
          )}
          {error && <p className="text-sm text-rose-600">{error}</p>}
        </div>
      )}

      {/* Cards */}
      {visible.length === 0 ? (
        <div className="mt-24 text-center text-slate-400">
          <p>No receipts yet. Tap the + to add your first.</p>
        </div>
      ) : (
        <ul className="space-y-3 pb-24">
          {visible.map((c) => {
            const isSel = selected.has(c.id);
            const body = (
              <>
                {selectMode && (
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs ${
                      isSel
                        ? "border-violet-600 bg-violet-600 text-white"
                        : "border-slate-300 text-transparent"
                    }`}
                  >
                    ✓
                  </span>
                )}
                <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg bg-slate-100">
                  {c.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={c.thumbnailUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-900">
                    {c.vendor ?? "Unknown vendor"}
                  </p>
                  <p className="text-sm text-slate-500">
                    {formatDate(c.receipt_date)}
                    {c.uploaderName && (
                      <span className="text-slate-400"> · {c.uploaderName}</span>
                    )}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="font-semibold text-slate-900">
                    {formatAmount(c.amount_total, c.currency)}
                  </span>
                  {c.departmentName && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${departmentBadgeClass(
                        c.departmentCode,
                      )}`}
                    >
                      {c.departmentName}
                    </span>
                  )}
                </div>
              </>
            );

            const cls =
              "flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left shadow-sm ring-1 active:bg-slate-50 " +
              (isSel ? "ring-violet-300" : "ring-slate-100");

            return (
              <li key={c.id}>
                {selectMode ? (
                  <button onClick={() => toggle(c.id)} className={cls}>
                    {body}
                  </button>
                ) : (
                  <Link href={`/receipts/${c.id}`} className={cls}>
                    {body}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {/* The "+ New receipt" button lives in the app layout (shown on every
          screen), so it is no longer rendered here. */}
    </div>
  );
}
