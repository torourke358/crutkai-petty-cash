"use client";

import { useState } from "react";
import Link from "next/link";
import type { Department } from "@/lib/types";

function monthStart(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const inputClass =
  "mt-1 block w-full rounded-lg border border-slate-300 px-4 py-3 text-base text-slate-900 shadow-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900";

export default function ExportForm({
  departments,
}: {
  departments: Department[];
}) {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function download() {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (selected.size > 0) params.set("departments", [...selected].join(","));
    // Navigating to the route triggers the file download (Content-Disposition).
    window.location.href = `/api/export?${params.toString()}`;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Export</h1>
        <Link href="/receipts" className="text-sm text-slate-500">
          Back
        </Link>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="min-w-0 flex-1">
          <label htmlFor="from" className="block text-sm font-medium text-slate-700">
            From
          </label>
          <input
            id="from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="min-w-0 flex-1">
          <label htmlFor="to" className="block text-sm font-medium text-slate-700">
            To
          </label>
          <input
            id="to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <p className="text-sm font-medium text-slate-700">
          Departments{" "}
          <span className="font-normal text-slate-400">(all if none chosen)</span>
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {departments.map((d) => {
            const active = selected.has(d.id);
            return (
              <button
                key={d.id}
                onClick={() => toggle(d.id)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-slate-900 text-white"
                    : "bg-white text-slate-600 ring-1 ring-slate-200"
                }`}
              >
                {d.name}
              </button>
            );
          })}
        </div>
      </div>

      <button
        onClick={download}
        className="flex w-full items-center justify-center rounded-xl bg-violet-600 px-4 py-4 text-base font-medium text-white active:bg-violet-700"
      >
        Download Excel (.xlsx)
      </button>
    </div>
  );
}
