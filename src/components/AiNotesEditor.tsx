"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function AiNotesEditor({
  current,
  defaultInstruction,
}: {
  current: string;
  defaultInstruction: string;
}) {
  const router = useRouter();
  const [text, setText] = useState(current);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setMessage(null);
    setError(null);
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes_instruction: text.trim() }),
    });
    setSaving(false);
    if (!res.ok) {
      setError("Couldn't save. Please try again.");
      return;
    }
    setMessage("Saved. New receipts will use this guidance.");
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">AI notes</h1>
        <Link href="/receipts" className="text-sm text-slate-500">
          Back
        </Link>
      </div>

      <p className="text-sm text-slate-500">
        This tells the AI what to write in the <strong>Notes</strong> field when
        it reads a receipt. Describe what you want captured. Changes apply to
        receipts read from now on.
      </p>

      <div className="rounded-2xl bg-violet-50 p-4 text-sm text-violet-900">
        <p className="font-medium">Tips</p>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li>Ask for what the expense was for (the goods or services).</li>
          <li>Mention specifics, e.g. &quot;for restaurants, include the name, location, and tip.&quot;</li>
          <li>Tell it what to ignore, e.g. &quot;don&apos;t note the payment method.&quot;</li>
        </ul>
      </div>

      <div>
        <label htmlFor="instruction" className="block text-sm font-medium text-slate-700">
          Note-writing instruction
        </label>
        <textarea
          id="instruction"
          rows={7}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
        />
        <p className="mt-1 text-right text-xs text-slate-400">
          {text.length}/2000
        </p>
      </div>

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

      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={saving || !text.trim()}
          className="flex-1 rounded-xl bg-violet-600 px-4 py-3 text-base font-medium text-white active:bg-violet-700 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          onClick={() => setText(defaultInstruction)}
          disabled={saving}
          className="rounded-xl bg-white px-4 py-3 text-base font-medium text-slate-700 ring-1 ring-slate-200"
        >
          Reset to default
        </button>
      </div>
    </div>
  );
}
