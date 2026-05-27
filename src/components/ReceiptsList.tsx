"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Department } from "@/lib/types";
import { departmentBadgeClass } from "@/lib/departments";
import { formatAmount, formatDate } from "@/lib/format";

export interface ReceiptCard {
  id: string;
  vendor: string | null;
  amount_total: number | null;
  currency: string;
  receipt_date: string | null;
  notes: string | null;
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
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
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
    return cards.filter((c) => {
      if (filter !== "all" && c.departmentId !== filter) return false;
      if (debounced) {
        const hay = `${c.vendor ?? ""} ${c.notes ?? ""}`.toLowerCase();
        if (!hay.includes(debounced)) return false;
      }
      return true;
    });
  }, [cards, filter, debounced]);

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
