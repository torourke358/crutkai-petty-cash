"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Category, Department } from "@/lib/types";
import { CATEGORIES, CATEGORY_LABELS } from "@/lib/types";
import { departmentBadgeClass } from "@/lib/departments";
import { formatAmount, formatDate } from "@/lib/format";

export interface ReceiptCard {
  id: string;
  vendor: string | null;
  amount_total: number | null;
  currency: string;
  receipt_date: string | null;
  notes: string | null;
  category: Category;
  departmentId: string | null;
  departmentCode: string | null;
  departmentName: string | null;
  thumbnailUrl: string | null;
  hasImage: boolean;
  uploaderName: string | null;
}

export default function ReceiptsList({
  cards,
  departments,
  isAdmin,
}: {
  cards: ReceiptCard[];
  departments: Department[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<string | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<Set<Category>>(
    new Set(),
  );
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [showDates, setShowDates] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 300ms debounce on the search box.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim().toLowerCase()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const visible = useMemo(() => {
    // Every typed word must match (case-insensitive substring across vendor +
    // notes). To search across categories, tap chips instead.
    const terms = debounced.split(/\s+/).filter(Boolean);
    return cards.filter((c) => {
      if (filter !== "all" && c.departmentId !== filter) return false;

      // Category filter: empty set = show all; otherwise the receipt's
      // category must be one of the selected chips.
      if (categoryFilter.size > 0 && !categoryFilter.has(c.category)) {
        return false;
      }

      // Date range (ISO date strings compare correctly as text).
      if (fromDate || toDate) {
        if (!c.receipt_date) return false;
        if (fromDate && c.receipt_date < fromDate) return false;
        if (toDate && c.receipt_date > toDate) return false;
      }

      if (terms.length > 0) {
        const hay = `${c.vendor ?? ""} ${c.notes ?? ""}`.toLowerCase();
        if (!terms.every((t) => hay.includes(t))) return false;
      }
      return true;
    });
  }, [cards, filter, categoryFilter, debounced, fromDate, toDate]);

  // Running total of the matching receipts (answers "how much on X?").
  const { total, currencyLabel } = useMemo(() => {
    let sum = 0;
    const currencies = new Set<string>();
    for (const c of visible) {
      sum += Number(c.amount_total ?? 0);
      if (c.amount_total != null) currencies.add(c.currency);
    }
    return {
      total: sum,
      currencyLabel: currencies.size === 1 ? [...currencies][0] : "mixed",
    };
  }, [visible]);

  const filtersActive =
    !!debounced ||
    filter !== "all" ||
    categoryFilter.size > 0 ||
    !!fromDate ||
    !!toDate;

  const chips = [{ id: "all" as const, name: "All" }, ...departments];

  function toggleCategory(c: Category) {
    setCategoryFilter((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  }

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
    setError(null);
  }

  function remove() {
    if (!confirm(`Delete ${selected.size} receipt(s)? This can't be undone.`)) {
      return;
    }
    setBusy(true);
    setError(null);
    const ids = [...selected];
    Promise.all(
      ids.map((id) =>
        fetch(`/api/receipts/${id}`, { method: "DELETE" }).catch(() => null),
      ),
    ).then((results) => {
      setBusy(false);
      const failed = results.filter((r) => !r || !r.ok).length;
      if (failed > 0) {
        setError(`Some receipts couldn't be deleted (${failed} of ${ids.length})`);
        return;
      }
      exitSelect();
      router.refresh();
    });
  }

  return (
    <div className="relative">
      {/* Vessel banner. Fixed height + object-cover so there's no layout shift. */}
      <div className="relative mb-4 h-40 overflow-hidden rounded-2xl bg-slate-200">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/vessel.png"
          alt="Anne Marie"
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />
        <p className="absolute bottom-3 left-4 text-lg font-semibold text-white drop-shadow">
          Anne Marie
        </p>
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search vendor or notes..."
          className="block w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 pr-9 text-base text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 text-lg leading-none text-slate-400 hover:text-slate-700"
          >
            ×
          </button>
        )}
      </div>

      {/* Date-range toggle */}
      <div className="mb-3 flex items-center justify-end">
        <button
          onClick={() => setShowDates((s) => !s)}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ring-1 ring-slate-200 ${
            fromDate || toDate
              ? "bg-violet-50 text-violet-700"
              : "bg-white text-slate-600"
          }`}
        >
          Dates{fromDate || toDate ? " •" : ""}
        </button>
      </div>

      {showDates && (
        <div className="mb-3 flex flex-col gap-3 rounded-2xl bg-white p-3 ring-1 ring-slate-200 sm:flex-row">
          <div className="min-w-0 flex-1">
            <label htmlFor="from" className="block text-xs font-medium text-slate-500">
              From
            </label>
            <input
              id="from"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
            />
          </div>
          <div className="min-w-0 flex-1">
            <label htmlFor="to" className="block text-xs font-medium text-slate-500">
              To
            </label>
            <input
              id="to"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
            />
          </div>
          {(fromDate || toDate) && (
            <button
              onClick={() => {
                setFromDate("");
                setToDate("");
              }}
              className="self-end text-sm font-medium text-slate-500 hover:text-slate-900"
            >
              Clear dates
            </button>
          )}
        </div>
      )}

      {/* Live total of matching receipts */}
      {filtersActive && (
        <div className="mb-3 flex items-center justify-between rounded-xl bg-slate-900 px-4 py-2.5 text-sm text-white">
          <span>
            {visible.length} {visible.length === 1 ? "receipt" : "receipts"}
          </span>
          <span className="font-semibold tabular-nums">
            {formatAmount(total, currencyLabel === "mixed" ? "" : currencyLabel)}
            {currencyLabel === "mixed" && (
              <span className="ml-1 text-xs font-normal text-slate-300">
                mixed currencies
              </span>
            )}
          </span>
        </div>
      )}

      {/* Toolbar: department chips + select toggle */}
      <div className="mb-2 flex items-center justify-between gap-2">
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

      {/* Category chips (multi-select). Tap several to OR-combine. */}
      <div className="mb-3 -ml-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {CATEGORIES.map((c) => {
          const active = categoryFilter.has(c);
          return (
            <button
              key={c}
              onClick={() => toggleCategory(c)}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-600 ring-1 ring-slate-200"
              }`}
            >
              {CATEGORY_LABELS[c]}
            </button>
          );
        })}
      </div>

      {/* Bulk action bar (delete only) */}
      {selectMode && (
        <div className="sticky top-16 z-10 mb-3 space-y-2 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
          <p className="text-sm font-medium text-slate-700">
            {selected.size} selected
          </p>
          {isAdmin ? (
            <button
              onClick={remove}
              disabled={busy || selected.size === 0}
              className="w-full rounded-xl border border-rose-200 px-4 py-2 text-sm font-medium text-rose-600 active:bg-rose-50 disabled:opacity-50"
            >
              Delete selected
            </button>
          ) : (
            <p className="text-sm text-slate-400">
              Select receipts to manage them.
            </p>
          )}
          {error && <p className="text-sm text-rose-600">{error}</p>}
        </div>
      )}

      {/* Cards */}
      {visible.length === 0 ? (
        <div className="mt-16 text-center text-slate-400">
          <p>
            {debounced || filter !== "all"
              ? "No receipts match."
              : "No receipts yet. Tap the + to add your first."}
          </p>
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
                <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100">
                  {c.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={c.thumbnailUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="px-1 text-center text-[10px] font-medium leading-tight text-slate-400">
                      No photo
                    </span>
                  )}
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
