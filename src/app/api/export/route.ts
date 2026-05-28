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
  image_path: string | null;
  department: { name: string } | null;
}

// "YYYY-MM-DD" → local Date (noon avoids timezone day-rollbacks in Excel).
function toDate(value: string | null): Date | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 12);
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
  const data = rows ?? [];

  // Uploader names (no FK from receipts to user_profiles, so map separately).
  const userIds = [...new Set(data.map((r) => r.user_id))];
  const { data: profiles } = await supabase
    .from("user_profiles")
    .select("id, full_name")
    .in("id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);
  const nameById = new Map(
    (profiles ?? []).map((p) => [p.id, p.full_name] as const),
  );

  const buffer = await buildWorkbook(data, nameById);
  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(buffer as ArrayBuffer, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="petty-cash-${stamp}.xlsx"`,
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

  const ws = wb.addWorksheet("Receipts", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  const headers = [
    "Date",
    "Vendor",
    "Amount",
    "Currency",
    "Department",
    "User",
    "Notes",
  ];
  ws.addRow(headers);

  // Track max content length per column for auto-width.
  const widths = headers.map((h) => h.length);
  const note = (i: number, v: unknown) => {
    const len = v == null ? 0 : String(v).length;
    if (len > widths[i]) widths[i] = len;
  };

  for (const r of data) {
    const date = toDate(r.receipt_date);
    const user = nameById.get(r.user_id) ?? "Unknown";

    const row = ws.addRow([
      date ?? "",
      r.vendor ?? "",
      r.amount_total ?? null,
      r.currency ?? "",
      r.department?.name ?? "",
      user,
      r.notes ?? "",
    ]);
    if (date) row.getCell(1).numFmt = "mm/dd/yyyy";
    row.getCell(3).numFmt = "#,##0.00";

    note(0, r.receipt_date);
    note(1, r.vendor);
    note(2, r.amount_total);
    note(3, r.currency);
    note(4, r.department?.name);
    note(5, user);
    note(6, r.notes);
  }

  // Header styling: bold on a slate-100 fill, frozen (set in views above).
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE2E8F0" },
  };

  // Totals row.
  const totalRow = ws.addRow([]);
  totalRow.getCell(2).value = "TOTAL";
  if (data.length > 0) {
    totalRow.getCell(3).value = { formula: `SUM(C2:C${data.length + 1})` };
  }
  totalRow.getCell(3).numFmt = "#,##0.00";
  totalRow.font = { bold: true };

  // Apply auto-widths (clamp so a long Notes cell doesn't blow out the sheet).
  ws.columns.forEach((col, i) => {
    col.width = Math.min(widths[i] + 2, 40);
  });

  return wb.xlsx.writeBuffer();
}
