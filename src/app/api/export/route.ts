import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth";

interface Row {
  user_id: string;
  vendor: string | null;
  receipt_date: string | null;
  amount_total: number | null;
  currency: string;
  notes: string | null;
  image_path: string;
  department: { name: string } | null;
}

// Quote a CSV field, escaping embedded quotes per RFC 4180.
function csv(value: unknown): string {
  const s = value == null ? "" : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

export async function GET(request: Request) {
  const role = await getUserRole();
  if (role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = await createClient();
  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const departments = url.searchParams.get("departments");

  let query = supabase
    .from("receipts")
    .select(
      "user_id, vendor, receipt_date, amount_total, currency, notes, image_path, department:departments(name)",
    )
    .order("receipt_date", { ascending: true });

  if (from) query = query.gte("receipt_date", from);
  if (to) query = query.lte("receipt_date", to);
  if (departments) {
    query = query.in("department_id", departments.split(",").filter(Boolean));
  }

  const { data: rows, error } = await query.returns<Row[]>();
  if (error) {
    console.error("export query failed", error);
    return NextResponse.json({ error: "export_failed" }, { status: 500 });
  }

  // Map user_id -> full name (no direct FK from receipts to user_profiles).
  const userIds = [...new Set((rows ?? []).map((r) => r.user_id))];
  const { data: profiles } = await supabase
    .from("user_profiles")
    .select("id, full_name")
    .in("id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);
  const nameById = new Map(
    (profiles ?? []).map((p) => [p.id, p.full_name] as const),
  );

  const header = [
    "receipt_date",
    "vendor",
    "amount_total",
    "currency",
    "department",
    "user",
    "notes",
    "image_path",
  ];

  const lines = [header.join(",")];
  for (const r of rows ?? []) {
    lines.push(
      [
        csv(r.receipt_date),
        csv(r.vendor),
        csv(r.amount_total),
        csv(r.currency),
        csv(r.department?.name),
        csv(nameById.get(r.user_id)),
        csv(r.notes),
        csv(r.image_path),
      ].join(","),
    );
  }

  const body = lines.join("\r\n");
  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="petty-cash-${stamp}.csv"`,
    },
  });
}
