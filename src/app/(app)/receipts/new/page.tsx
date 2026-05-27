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

const emptyValues: ReceiptFormValues = {
  vendor: "",
  receipt_date: new Date().toISOString().slice(0, 10),
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
      // Only fill if the user hasn't already picked a department.
      setValues((cur) =>
        cur.department_id ? cur : { ...cur, department_id: data as string },
      );
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
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

  async function readReceipt() {
    if (!blob) return;
    setError(null);
    setStage("reading");

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login");
      return;
    }

    const path = `${user.id}/${crypto.randomUUID()}.jpg`;

    const { error: uploadError } = await supabase.storage
      .from("receipts")
      .upload(path, blob, { contentType: "image/jpeg" });
    if (uploadError) {
      setError("Upload failed. Check your connection and try again.");
      setStage("preview");
      return;
    }

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

    if (extracted.error === "not_a_receipt") {
      setError(
        "We couldn't read this as a receipt. You can still enter the details by hand.",
      );
    }

    const vendor = (extracted.vendor as string) ?? "";

    setImagePath(path);
    setValues((v) => ({
      vendor,
      receipt_date:
        (extracted.receipt_date as string) ||
        new Date().toISOString().slice(0, 10),
      amount_total:
        extracted.amount_total != null ? String(extracted.amount_total) : "",
      currency: (extracted.currency as string) || "USD",
      department_id: "",
      client_id: v.client_id || lastClientId,
      notes: (extracted.notes as string) ?? "",
    }));
    setConfidence((extracted.confidence as Confidence) ?? null);
    setAiExtraction(extracted.ai_extraction ?? extracted);
    setStage("verify");

    // Pre-fill the department from this vendor's coding history.
    if (vendor) autofillDepartment(vendor);
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

    if (!res.ok) {
      setError("Save failed. Please try again.");
      setSaving(false);
      return;
    }

    router.push("/receipts");
    router.refresh();
  }

  const lowConfidence = confidence === "low" || confidence === "medium";

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">New receipt</h1>
        <Link href="/receipts" className="text-sm text-slate-500">
          Cancel
        </Link>
      </div>

      {error && (
        <p className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      )}

      {/* Hidden file inputs */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFile}
      />
      <input
        ref={libraryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFile}
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
        </div>
      )}

      {(stage === "preview" || stage === "reading") && previewUrl && (
        <div className="space-y-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="Receipt preview"
            className="w-full rounded-2xl ring-1 ring-slate-200"
          />
          <button
            onClick={readReceipt}
            disabled={stage === "reading"}
            className="flex w-full items-center justify-center rounded-xl bg-violet-600 px-4 py-4 text-base font-medium text-white active:bg-violet-700 disabled:opacity-60"
          >
            {stage === "reading" ? "Reading receipt…" : "Read receipt"}
          </button>
          {stage === "preview" && (
            <button
              onClick={() => {
                setStage("capture");
                setBlob(null);
              }}
              className="w-full text-center text-sm text-slate-500"
            >
              Retake
            </button>
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
            {saving ? "Saving…" : "Save receipt"}
          </button>
        </div>
      )}
    </div>
  );
}
