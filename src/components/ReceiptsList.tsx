"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Department } from "@/lib/types";
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
}: {
  cards: ReceiptCard[];
  departments: Department[];
  isAdmin: boolean;
}) {
  const [filter, setFilter] = useState<string | "all">("all");

  const visible = useMemo(
    () =>
      filter === "all"
        ? cards
        : cards.filter((c) => c.departmentId === filter),
    [cards, filter],
  );

  const chips = [{ id: "all" as const, name: "All" }, ...departments];

  return (
    <div className="relative">
      {/* Filter chips */}
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
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

      {/* Cards */}
      {visible.length === 0 ? (
        <div className="mt-24 text-center text-slate-400">
          <p>No receipts yet. Tap the + to add your first.</p>
        </div>
      ) : (
        <ul className="space-y-3 pb-24">
          {visible.map((c) => (
            <li key={c.id}>
              <Link
                href={`/receipts/${c.id}`}
                className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-100 active:bg-slate-50"
              >
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
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* Floating action button */}
      <Link
        href="/receipts/new"
        className="safe-bottom fixed bottom-6 right-6 flex h-14 items-center gap-2 rounded-full bg-violet-600 px-6 text-base font-medium text-white shadow-lg shadow-violet-300/50 active:bg-violet-700"
      >
        <span className="text-xl leading-none">+</span>
        New receipt
      </Link>
    </div>
  );
}
