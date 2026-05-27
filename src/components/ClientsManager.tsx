"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Client } from "@/lib/types";

export default function ClientsManager({
  initialClients,
}: {
  initialClients: Client[];
}) {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>(initialClients);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addClient() {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("Couldn't add that client. Try again.");
      return;
    }
    const created = (await res.json()) as Client;
    setClients((c) => [...c, created]);
    setNewName("");
    router.refresh();
  }

  async function rename(client: Client) {
    const name = prompt("Rename client", client.name)?.trim();
    if (!name || name === client.name) return;
    const res = await fetch(`/api/clients/${client.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (res.ok) {
      setClients((cs) =>
        cs.map((c) => (c.id === client.id ? { ...c, name } : c)),
      );
      router.refresh();
    }
  }

  async function toggleActive(client: Client) {
    const active = !client.active;
    const res = await fetch(`/api/clients/${client.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    });
    if (res.ok) {
      setClients((cs) =>
        cs.map((c) => (c.id === client.id ? { ...c, active } : c)),
      );
      router.refresh();
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Clients</h1>
        <Link href="/receipts" className="text-sm text-slate-500">
          Back
        </Link>
      </div>

      <p className="text-sm text-slate-500">
        Clients are who an expense is billed to. Add a charter or guest here;
        they&apos;ll appear in the &quot;Bill to&quot; dropdown on every receipt.
      </p>

      <div className="flex gap-2">
        <input
          type="text"
          value={newName}
          placeholder="New client name"
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addClient()}
          className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
        />
        <button
          onClick={addClient}
          disabled={busy || !newName.trim()}
          className="rounded-xl bg-violet-600 px-5 py-3 text-base font-medium text-white active:bg-violet-700 disabled:opacity-60"
        >
          Add
        </button>
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <ul className="space-y-2">
        {clients.map((c) => (
          <li
            key={c.id}
            className="flex items-center justify-between rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-100"
          >
            <div className="min-w-0">
              <p
                className={`truncate font-medium ${
                  c.active ? "text-slate-900" : "text-slate-400 line-through"
                }`}
              >
                {c.name}
              </p>
              {c.is_overhead && (
                <span className="text-xs text-slate-400">
                  Non-billable overhead
                </span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-3">
              {!c.is_overhead && (
                <button
                  onClick={() => rename(c)}
                  className="text-sm font-medium text-slate-500 hover:text-slate-900"
                >
                  Rename
                </button>
              )}
              {!c.is_overhead && (
                <button
                  onClick={() => toggleActive(c)}
                  className="text-sm font-medium text-slate-500 hover:text-slate-900"
                >
                  {c.active ? "Deactivate" : "Reactivate"}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
