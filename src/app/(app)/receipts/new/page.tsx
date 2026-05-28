"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { prepareImage } from "@/lib/image";
import { todayLocal } from "@/lib/format";
import ReceiptFormFields, {
  type ReceiptFormValues,
} from "@/components/ReceiptFormFields";
import type { Department, Confidence, Category } from "@/lib/types";
import { CATEGORIES } from "@/lib/types";

type Stage = "capture" | "preview" | "reading" | "verify";

const emptyValues: ReceiptFormValues = {
  vendor: "",
  receipt_date: todayLocal(),
  amount_total: "",
  currency: "USD",
  category: "other",
  department_id: "",
  notes: "",
};

export default function NewReceiptPage() {
  const router = useRouter();
  const supabase = createClient();

  const [stage, setStage] = useState<Stage>("capture");
  const [departments, setDepartments] = useState<Department[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [values, setValues] = useState<ReceiptFormValues>(emptyValues);
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const [aiExtraction, setAiExtraction] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Batch state: when several files are chosen, we process them one at a time.
  const [queue, setQueue] = useState<File[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [savedCount, setSavedCount] = useState(0);
  const isBatch = queue.length > 1;
  const hasMore = isBatch && queueIndex < queue.length - 1;

  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  // Each call to autofillDepartment bumps this counter. The RPC callback no-ops
  // if a newer item has loaded — otherwise a slow vendor lookup for receipt N
  // can resolve after N+1 is on screen and write N's department onto N+1.
  const autofillIdRef = useRef(0);

  useEffect(() => {
    supabase
      .from("departments")
      .select("id, code, name, display_order, active")
      .eq("active", true)
      .order("display_order")
      .then(({ data }) => setDepartments((data as Department[]) ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-code the department from the vendor's history (shared across crew).
  async function autofillDepartment(vendor: string) {
    const v = vendor.trim();
    if (!v) return;
    autofillIdRef.current += 1;
    const myId = autofillIdRef.current;
    const { data } = await supabase.rpc("vendor_default_department", {
      p_vendor: v,
    });
    if (myId !== autofillIdRef.current) return; // a newer item is loaded
    if (data) {
      setValues((cur) =>
        cur.department_id ? cur : { ...cur, department_id: data as string },
      );
    }
  }

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // allow re-selecting the same files later
    if (files.length === 0) return;
    setError(null);
    setManual(false);

    if (files.length === 1) {
      // Single file: keep the preview → "Read receipt" flow.
      setQueue([]);
      prepareSingle(files[0]);
      return;
    }

    // Multiple files: process them as a reviewed batch.
    setQueue(files);
    setQueueIndex(0);
    setSavedCount(0);
    processItem(0, files);
  }

  // Start a manual, photo-less entry (e.g. paying a dayworker in cash).
  function startManual() {
    setError(null);
    setManual(true);
    setQueue([]);
    setBlob(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setImagePath(null);
    setConfidence(null);
    setAiExtraction(null);
    setValues({ ...emptyValues, receipt_date: todayLocal() });
    setStage("verify");
  }

  async function prepareSingle(file: File) {
    try {
      const prepared = await prepareImage(file);
      setBlob(prepared);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(prepared));
      setStage("preview");
    } catch {
      setError("Couldn't read that image. Try another photo.");
    }
  }

  // Upload + extract a single Blob; returns the storage path or null on failure.
  async function uploadAndExtract(prepared: Blob) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login");
      return null;
    }

    const path = `${user.id}/${crypto.randomUUID()}.jpg`;
    const { error: uploadError } = await supabase.storage
      .from("receipts")
      .upload(path, prepared, { contentType: "image/jpeg" });
    if (uploadError) return null;

    // Hand the server the storage path; it signs the URL under the user's
    // session and refuses paths outside the caller's folder.
    let extracted: Record<string, unknown> = {};
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_path: path }),
      });
      extracted = await res.json();
    } catch {
      // Network error — fall through to a blank form.
    }
    return { path, extracted };
  }

  // Single-file path: read the already-previewed blob.
  async function readReceipt() {
    if (!blob) return;
    setError(null);
    setStage("reading");

    const result = await uploadAndExtract(blob);
    if (!result) {
      setError("Upload failed. Check your connection and try again.");
      setStage("preview");
      return;
    }
    applyExtraction(result.path, result.extracted);
  }

  // Batch path: prepare, upload, and read the i-th file, then show its form.
  async function processItem(i: number, files: File[]) {
    setError(null);
    setStage("reading");
    setImagePath(null);

    let prepared: Blob;
    try {
      prepared = await prepareImage(files[i]);
    } catch {
      setError(`Couldn't read image ${i + 1} of ${files.length}.`);
      return; // user can Skip from the error
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(prepared));

    const result = await uploadAndExtract(prepared);
    if (!result) {
      setError(`Upload failed for receipt ${i + 1} of ${files.length}.`);
      return; // user can Skip from the error
    }
    applyExtraction(result.path, result.extracted);
  }

  function applyExtraction(path: string, extracted: Record<string, unknown>) {
    if (extracted.error === "not_a_receipt") {
      setError(
        "We couldn't read this as a receipt. You can still enter the details by hand.",
      );
    } else if (extracted.error === "extraction_failed") {
      setError(
        "We couldn't read this one. Try again, or fill in the details by hand.",
      );
    }
    const vendor = (extracted.vendor as string) ?? "";

    const aiCategory = extracted.category as string | undefined;
    const category: Category = (CATEGORIES as readonly string[]).includes(
      aiCategory ?? "",
    )
      ? (aiCategory as Category)
      : "other";

    setImagePath(path);
    setValues({
      vendor,
      receipt_date: (extracted.receipt_date as string) || todayLocal(),
      amount_total:
        extracted.amount_total != null ? String(extracted.amount_total) : "",
      currency: (extracted.currency as string) || "USD",
      category,
      department_id: "",
      notes: (extracted.notes as string) ?? "",
    });
    setConfidence((extracted.confidence as Confidence) ?? null);
    setAiExtraction(extracted.ai_extraction ?? extracted);
    setStage("verify");

    if (vendor) autofillDepartment(vendor);
  }

  function advance() {
    const next = queueIndex + 1;
    setQueueIndex(next);
    processItem(next, queue);
  }

  function skip() {
    if (hasMore) advance();
    else finish();
  }

  function finish() {
    router.push("/receipts");
    router.refresh();
  }

  async function save() {
    // Photo flow needs an uploaded image; manual entries have none.
    if (!manual && !imagePath) return;
    if (!values.department_id) {
      setError("Please choose a department.");
      return;
    }
    if (manual && (!values.vendor || !values.receipt_date || !values.amount_total)) {
      setError("Vendor, date, and amount are required.");
      return;
    }
    setSaving(true);
    setError(null);

    const res = await fetch("/api/receipts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image_path: manual ? null : imagePath,
        vendor: values.vendor || null,
        receipt_date: values.receipt_date || null,
        amount_total: values.amount_total ? Number(values.amount_total) : null,
        currency: values.currency,
        category: values.category,
        department_id: values.department_id,
        notes: values.notes || null,
        ai_extraction: manual ? null : aiExtraction,
        ai_confidence: manual ? null : confidence,
      }),
    });

    setSaving(false);
    if (!res.ok) {
      setError("Save failed. Please try again.");
      return;
    }

    setSavedCount((n) => n + 1);

    if (hasMore) advance();
    else finish();
  }

  const lowConfidence = confidence === "low" || confidence === "medium";
  const stepLabel = isBatch ? ` (${queueIndex + 1} of ${queue.length})` : "";

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">
          {manual ? "Manual entry" : `New receipt${stepLabel}`}
        </h1>
        <Link href="/receipts" className="text-sm text-slate-500">
          {savedCount > 0 ? "Done" : "Cancel"}
        </Link>
      </div>

      {error && (
        <div className="mb-4 space-y-2">
          <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </p>
          {isBatch && stage === "reading" && (
            <button
              onClick={skip}
              className="text-sm font-medium text-slate-600 underline"
            >
              {hasMore ? "Skip this one and continue →" : "Finish"}
            </button>
          )}
        </div>
      )}

      {/* Hidden file inputs. Library allows selecting multiple. */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFiles}
      />
      <input
        ref={libraryRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFiles}
      />

      {stage === "capture" && (
        <div className="space-y-3">
          <button
            onClick={() => cameraRef.current?.click()}
            className="flex w-full items-center justify-center rounded-xl bg-violet-600 px-4 py-4 text-base font-medium text-white active:bg-violet-700"
          >
            Take photo
          </button>
          <button
            onClick={() => libraryRef.current?.click()}
            className="flex w-full items-center justify-center rounded-xl bg-white px-4 py-4 text-base font-medium text-slate-700 ring-1 ring-slate-200"
          >
            Choose from library
          </button>
          <button
            onClick={startManual}
            className="flex w-full items-center justify-center rounded-xl bg-white px-4 py-4 text-base font-medium text-slate-700 ring-1 ring-slate-200"
          >
            Add without photo
          </button>
          <p className="text-center text-xs text-slate-400">
            Tip: select several receipts at once from the library. If a receipt
            is already on a screen, upload the image or a screenshot instead of
            photographing the monitor — it reads far more reliably. Use “Add
            without photo” for cash payments with no receipt.
          </p>
        </div>
      )}

      {stage === "preview" && previewUrl && (
        <div className="space-y-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="Receipt preview"
            className="w-full rounded-2xl ring-1 ring-slate-200"
          />
          <button
            onClick={readReceipt}
            className="flex w-full items-center justify-center rounded-xl bg-violet-600 px-4 py-4 text-base font-medium text-white active:bg-violet-700"
          >
            Read receipt
          </button>
          <button
            onClick={() => {
              setStage("capture");
              setBlob(null);
            }}
            className="w-full text-center text-sm text-slate-500"
          >
            Retake
          </button>
        </div>
      )}

      {stage === "reading" && (
        <div className="space-y-4">
          {previewUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="Receipt"
              className="max-h-64 w-full rounded-2xl object-contain ring-1 ring-slate-200"
            />
          )}
          {!error && (
            <p className="text-center text-sm text-slate-500">
              Reading receipt{stepLabel}…
            </p>
          )}
        </div>
      )}

      {stage === "verify" && (
        <div className="space-y-4 pb-8">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="Receipt"
              className="max-h-48 w-full rounded-2xl object-contain ring-1 ring-slate-200"
            />
          ) : manual ? (
            <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500 ring-1 ring-slate-100">
              No photo — enter the details below. Use Notes to record what the
              payment was for (e.g. “Paid Joe Smith — dayworker — deck wash”).
            </p>
          ) : null}

          {lowConfidence && (
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Double-check the amount and vendor.
            </p>
          )}

          <ReceiptFormFields
            values={values}
            onChange={(patch) => setValues((v) => ({ ...v, ...patch }))}
            onVendorBlur={autofillDepartment}
            departments={departments}
          />

          <button
            onClick={save}
            disabled={saving}
            className="flex w-full items-center justify-center rounded-xl bg-violet-600 px-4 py-4 text-base font-medium text-white active:bg-violet-700 disabled:opacity-60"
          >
            {saving
              ? "Saving…"
              : hasMore
                ? "Save & next"
                : isBatch
                  ? "Save & finish"
                  : "Save receipt"}
          </button>

          {isBatch && hasMore && (
            <button
              onClick={skip}
              disabled={saving}
              className="w-full text-center text-sm text-slate-500"
            >
              Skip this receipt →
            </button>
          )}
        </div>
      )}
    </div>
  );
}
