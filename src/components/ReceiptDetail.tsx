"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ReceiptFormFields, {
  type ReceiptFormValues,
} from "@/components/ReceiptFormFields";
import { formatDate } from "@/lib/format";
import type { Department, Client, Receipt } from "@/lib/types";

export interface AuditEntry {
  id: string;
  action: string;
  created_at: string;
  user_id: string | null;
  userName: string;
}

export default function ReceiptDetail({
  receipt,
  departments,
  clients,
  imageUrl,
  isAdmin,
  uploaderName,
  audit,
}: {
  receipt: Receipt;
  departments: Department[];
  clients: Client[];
  imageUrl: string | null;
  isAdmin: boolean;
  uploaderName: string;
  audit: AuditEntry[];
}) {
  const router = useRouter();

  const [values, setValues] = useState<ReceiptFormValues>({
    vendor: receipt.vendor ?? "",
    receipt_date: receipt.receipt_date ?? "",
    amount_total:
      receipt.amount_total != null ? String(receipt.amount_total) : "",
    currency: receipt.currency ?? "USD",
    department_id: receipt.department_id ?? "",
    client_id: receipt.client_id ?? "",
    notes: receipt.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!values.department_id) {
      setError("Please choose a department.");
      return;
    }
    if (!values.client_id) {
      setError("Please choose a client to bill to.");
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);

    const res = await fetch(`/api/receipts/${receipt.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vendor: values.vendor || null,
        receipt_date: values.receipt_date || null,
        amount_total: values.amount_total ? Number(values.amount_total) : null,
        currency: values.currency,
        department_id: values.department_id,
        client_id: values.client_id,
        notes: values.notes || null,
      }),
    });

    setSaving(false);
    if (!res.ok) {
      setError("Save failed. Please try again.");
      return;
    }
    setMessage("Saved.");
    router.refresh();
  }

  async function remove() {
    if (!confirm("Delete this receipt? This can't be undone.")) return;
    setDeleting(true);
    setError(null);

    const res = await fetch(`/api/receipts/${receipt.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      setError("Delete failed. Please try again.");
      setDeleting(false);
      return;
    }
    router.push("/receipts");
    router.refresh();
  }

  return (
    <div className="space-y-5 pb-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Receipt</h1>
        <Link href="/receipts" className="text-sm text-slate-500">
          Back
        </Link>
      </div>

      {imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt="Receipt"
          className="w-full rounded-2xl ring-1 ring-slate-200"
        />
      )}

      <p className="text-sm text-slate-500">
        Uploaded by{" "}
        <span className="font-medium text-slate-700">{uploaderName}</span>
      </p>

      {error && (
        <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      )}
      {message && (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {message}
        </p>
      )}

      <ReceiptFormFields
        values={values}
        onChange={(patch) => setValues((v) => ({ ...v, ...patch }))}
        departments={departments}
        clients={clients}
      />

      <button
        onClick={save}
        disabled={saving}
        className="flex w-full items-center justify-center rounded-xl bg-violet-600 px-4 py-4 text-base font-medium text-white active:bg-violet-700 disabled:opacity-60"
      >
        {saving ? "Saving…" : "Save changes"}
      </button>

      {isAdmin && (
        <>
          <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-100">
            <h2 className="text-sm font-semibold text-slate-900">History</h2>
            {audit.length === 0 ? (
              <p className="mt-2 text-sm text-slate-400">No history yet.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {audit.map((a) => (
                  <li key={a.id} className="text-sm text-slate-600">
                    <span className="font-medium capitalize">{a.action}</span>{" "}
                    by {a.userName} · {formatDate(a.created_at.slice(0, 10))}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <button
            onClick={remove}
            disabled={deleting}
            className="flex w-full items-center justify-center rounded-xl border border-rose-200 px-4 py-3 text-base font-medium text-rose-600 active:bg-rose-50 disabled:opacity-60"
          >
            {deleting ? "Deleting…" : "Delete receipt"}
          </button>
        </>
      )}
    </div>
  );
}
