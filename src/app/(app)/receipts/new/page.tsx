"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { prepareImage } from "@/lib/image";
import ReceiptFormFields, {
  type ReceiptFormValues,
} from "@/components/ReceiptFormFields";
import type { Department, Client, Confidence } from "@/lib/types";

type Stage = "capture" | "preview" | "reading" | "verify";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

const emptyValues: ReceiptFormValues = {
  vendor: "",
  receipt_date: todayStr(),
  amount_total: "",
  currency: "USD",
  department_id: "",
  client_id: "",
  notes: "",
};

export default function NewReceiptPage() {
  const router = useRouter();
  const supabase = createClient();

  const [stage, setStage] = useState<Stage>("capture");
  const [departments, setDepartments] = useState<Department[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [lastClientId, setLastClientId] = useState<string>("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [imagePath, setImagePath] = useState<string | null>(null);
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

  useEffect(() => {
    supabase
      .from("departments")
      .select("id, code, name, display_order, active")
      .eq("active", true)
      .order("display_order")
      .then(({ data }) => setDepartments((data as Department[]) ?? []));

    supabase
      .from("clients")
      .select("id, name, is_overhead, active, display_order")
      .eq("active", true)
      .order("display_order")
      .order("name")
      .then(({ data }) => setClients((data as Client[]) ?? []));

    // Default the client to the one this user used most recently (charters
    // run for a while, so the last client is usually the right one).
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase
        .from("receipts")
        .select("client_id")
        .eq("user_id", user.id)
        .not("client_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .then(({ data }) => {
          const id = (data?.[0]?.client_id as string) ?? "";
          if (id) {
            setLastClientId(id);
            setValues((v) => ({ ...v, client_id: v.client_id || id }));
          }
        });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-code the department from the vendor's history (shared across crew).
  async function autofillDepartment(vendor: string) {
    const v = vendor.trim();
    if (!v) return;
    const { data } = await supabase.rpc("vendor_default_department", {
      p_vendor: v,
    });
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
    processItem(0, files, lastClientId);
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

    const { data: signed } = await supabase.storage
      .from("receipts")
      .createSignedUrl(path, 60);

    let extracted: Record<string, unknown> = {};
    if (signed?.signedUrl) {
      try {
        const res = await fetch("/api/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageUrl: signed.signedUrl }),
        });
        extracted = await res.json();
      } catch {
        // Network error — fall through to a blank form.
      }
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
    applyExtraction(result.path, result.extracted, lastClientId);
  }

  // Batch path: prepare, upload, and read the i-th file, then show its form.
  async function processItem(i: number, files: File[], carryClient: string) {
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
    applyExtraction(result.path, result.extracted, carryClient);
  }

  function applyExtraction(
    path: string,
    extracted: Record<string, unknown>,
    carryClient: string,
  ) {
    if (extracted.error === "not_a_receipt") {
      setError(
        "We couldn't read this as a receipt. You can still enter the details by hand.",
      );
    }
    const vendor = (extracted.vendor as string) ?? "";

    setImagePath(path);
    setValues({
      vendor,
      receipt_date: (extracted.receipt_date as string) || todayStr(),
      amount_total:
        extracted.amount_total != null ? String(extracted.amount_total) : "",
      currency: (extracted.currency as string) || "USD",
      department_id: "",
      client_id: carryClient,
      notes: (extracted.notes as string) ?? "",
    });
    setConfidence((extracted.confidence as Confidence) ?? null);
    setAiExtraction(extracted.ai_extraction ?? extracted);
    setStage("verify");

    if (vendor) autofillDepartment(vendor);
  }

  function advance() {
    // Move to the next queued receipt, carrying the chosen client forward.
    const next = queueIndex + 1;
    setQueueIndex(next);
    processItem(next, queue, values.client_id || lastClientId);
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
    if (!imagePath) return;
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

    const res = await fetch("/api/receipts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image_path: imagePath,
        vendor: values.vendor || null,
        receipt_date: values.receipt_date || null,
        amount_total: values.amount_total ? Number(values.amount_total) : null,
        currency: values.currency,
        department_id: values.department_id,
        client_id: values.client_id,
        notes: values.notes || null,
        ai_extraction: aiExtraction,
        ai_confidence: confidence,
      }),
    });

    setSaving(false);
    if (!res.ok) {
      setError("Save failed. Please try again.");
      return;
    }

    setSavedCount((n) => n + 1);
    setLastClientId(values.client_id);

    if (hasMore) advance();
    else finish();
  }

  const lowConfidence = confidence === "low" || confidence === "medium";
  const stepLabel = isBatch ? ` (${queueIndex + 1} of ${queue.length})` : "";

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">
          New receipt{stepLabel}
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
          <p className="text-center text-xs text-slate-400">
            Tip: select several receipts at once from the library. If a receipt
            is already on a screen, upload the image or a screenshot instead of
            photographing the monitor — it reads far more reliably.
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
          {previewUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="Receipt"
              className="max-h-48 w-full rounded-2xl object-contain ring-1 ring-slate-200"
            />
          )}

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
            clients={clients}
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
