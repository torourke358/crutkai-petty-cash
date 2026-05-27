import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
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
  client: { name: string } | null;
}

// Quote a CSV field, escaping embedded quotes per RFC 4180.
function csv(value: unknown): string {
  const s = value == null ? "" : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

export async function GET(request: Request) {
  if ((await getUserRole()) !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = await createClient();
  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const departments = url.searchParams.get("departments");
  const format = url.searchParams.get("format") ?? "csv";

  let query = supabase
    .from("receipts")
    .select(
      "user_id, vendor, receipt_date, amount_total, currency, notes, image_path, department:departments(name), client:clients(name)",
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
  const data = rows ?? [];

  // Map user_id -> full name (no direct FK from receipts to user_profiles).
  const userIds = [...new Set(data.map((r) => r.user_id))];
  const { data: profiles } = await supabase
    .from("user_profiles")
    .select("id, full_name")
    .in("id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);
  const nameById = new Map(
    (profiles ?? []).map((p) => [p.id, p.full_name] as const),
  );

  const stamp = new Date().toISOString().slice(0, 10);

  if (format === "xlsx") {
    const buffer = await buildWorkbook(data, nameById);
    return new NextResponse(buffer as ArrayBuffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="petty-cash-${stamp}.xlsx"`,
      },
    });
  }

  // Default: CSV
  const header = [
    "receipt_date",
    "vendor",
    "amount_total",
    "currency",
    "department",
    "client",
    "user",
    "notes",
    "image_path",
  ];
  const lines = [header.join(",")];
  for (const r of data) {
    lines.push(
      [
        csv(r.receipt_date),
        csv(r.vendor),
        csv(r.amount_total),
        csv(r.currency),
        csv(r.department?.name),
        csv(r.client?.name),
        csv(nameById.get(r.user_id)),
        csv(r.notes),
        csv(r.image_path),
      ].join(","),
    );
  }

  return new NextResponse(lines.join("\r\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="petty-cash-${stamp}.csv"`,
    },
  });
}

async function buildWorkbook(
  data: Row[],
  nameById: Map<string, string | null>,
): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Crutkai Petty Cash";
  wb.created = new Date();

  // --- Receipts sheet ---
  const ws = wb.addWorksheet("Receipts", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  ws.columns = [
    { header: "Date", key: "date", width: 12 },
    { header: "Vendor", key: "vendor", width: 28 },
    { header: "Amount", key: "amount", width: 12 },
    { header: "Currency", key: "currency", width: 10 },
    { header: "Department", key: "department", width: 16 },
    { header: "Client", key: "client", width: 22 },
    { header: "Uploaded by", key: "user", width: 20 },
    { header: "Notes", key: "notes", width: 40 },
  ];

  for (const r of data) {
    ws.addRow({
      date: r.receipt_date ?? "",
      vendor: r.vendor ?? "",
      amount: r.amount_total ?? null,
      currency: r.currency ?? "",
      department: r.department?.name ?? "",
      client: r.client?.name ?? "Unassigned",
      user: nameById.get(r.user_id) ?? "Unknown",
      notes: r.notes ?? "",
    });
  }

  // Header styling
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF7C3AED" }, // violet-600
  };
  headerRow.alignment = { vertical: "middle" };
  headerRow.height = 20;

  // Amount column: 2-decimal number format
  ws.getColumn("amount").numFmt = "#,##0.00";
  ws.autoFilter = { from: "A1", to: "H1" };

  // Totals row at the bottom
  const totalRowIdx = ws.rowCount + 1;
  const totalRow = ws.getRow(totalRowIdx);
  totalRow.getCell(2).value = "Total";
  totalRow.getCell(2).font = { bold: true };
  if (data.length > 0) {
    totalRow.getCell(3).value = {
      formula: `SUM(C2:C${data.length + 1})`,
    };
  }
  totalRow.getCell(3).numFmt = "#,##0.00";
  totalRow.getCell(3).font = { bold: true };

  // --- Summary sheet ---
  const sum = wb.addWorksheet("Summary");

  const byClient = new Map<string, number>();
  const byDept = new Map<string, number>();
  for (const r of data) {
    const amt = Number(r.amount_total ?? 0);
    const cn = r.client?.name ?? "Unassigned";
    const dn = r.department?.name ?? "Unassigned";
    byClient.set(cn, (byClient.get(cn) ?? 0) + amt);
    byDept.set(dn, (byDept.get(dn) ?? 0) + amt);
  }

  sum.addRow(["By client", ""]).font = { bold: true };
  sum.addRow(["Client", "Total"]).font = { bold: true };
  for (const [name, total] of [...byClient.entries()].sort(
    (a, b) => b[1] - a[1],
  )) {
    const row = sum.addRow([name, total]);
    row.getCell(2).numFmt = "#,##0.00";
  }
  sum.addRow([]);
  sum.addRow(["By department", ""]).font = { bold: true };
  sum.addRow(["Department", "Total"]).font = { bold: true };
  for (const [name, total] of [...byDept.entries()].sort(
    (a, b) => b[1] - a[1],
  )) {
    const row = sum.addRow([name, total]);
    row.getCell(2).numFmt = "#,##0.00";
  }
  sum.getColumn(1).width = 24;
  sum.getColumn(2).width = 14;

  return wb.xlsx.writeBuffer();
}
