"use client";

import type { Department } from "@/lib/types";
import { CURRENCIES } from "@/lib/types";

export interface ReceiptFormValues {
  vendor: string;
  receipt_date: string;
  amount_total: string;
  currency: string;
  department_id: string;
  notes: string;
}

const inputClass =
  "mt-1 block w-full rounded-lg border border-slate-300 px-4 py-3 text-base text-slate-900 shadow-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900";
const labelClass = "block text-sm font-medium text-slate-700";

// Shared, controlled field set used by both the new-receipt and detail forms.
export default function ReceiptFormFields({
  values,
  onChange,
  departments,
}: {
  values: ReceiptFormValues;
  onChange: (patch: Partial<ReceiptFormValues>) => void;
  departments: Department[];
}) {
  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="vendor" className={labelClass}>
          Vendor
        </label>
        <input
          id="vendor"
          type="text"
          value={values.vendor}
          onChange={(e) => onChange({ vendor: e.target.value })}
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="receipt_date" className={labelClass}>
          Date
        </label>
        <input
          id="receipt_date"
          type="date"
          value={values.receipt_date}
          onChange={(e) => onChange({ receipt_date: e.target.value })}
          className={inputClass}
        />
      </div>

      <div className="flex gap-3">
        <div className="flex-1">
          <label htmlFor="amount_total" className={labelClass}>
            Amount
          </label>
          <input
            id="amount_total"
            type="number"
            inputMode="decimal"
            step="0.01"
            value={values.amount_total}
            onChange={(e) => onChange({ amount_total: e.target.value })}
            className={inputClass}
          />
        </div>
        <div className="w-28">
          <label htmlFor="currency" className={labelClass}>
            Currency
          </label>
          <select
            id="currency"
            value={values.currency}
            onChange={(e) => onChange({ currency: e.target.value })}
            className={inputClass}
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="department_id" className={labelClass}>
          Department
        </label>
        <select
          id="department_id"
          required
          value={values.department_id}
          onChange={(e) => onChange({ department_id: e.target.value })}
          className={inputClass}
        >
          <option value="" disabled>
            Choose a department
          </option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="notes" className={labelClass}>
          Notes
        </label>
        <textarea
          id="notes"
          rows={3}
          value={values.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
          className={inputClass}
        />
      </div>
    </div>
  );
}
