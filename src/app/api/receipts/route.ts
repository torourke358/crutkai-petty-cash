import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { todayLocal } from "@/lib/format";
import { CURRENCIES, CATEGORIES } from "@/lib/types";

const bodySchema = z.object({
  // Null for manual entries (no photo). Photo flow always supplies a path.
  image_path: z.string().min(1).nullable().optional(),
  vendor: z.string().nullable().optional(),
  receipt_date: z.string().nullable().optional(),
  amount_total: z.number().nullable().optional(),
  currency: z.enum(CURRENCIES).default("USD"),
  category: z.enum(CATEGORIES).default("other"),
  department_id: z.string().uuid(),
  // Accepted but ignored — the clients feature is hidden (kept for v2).
  client_id: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
  line_items: z.array(z.object({ description: z.string(), amount: z.number() })).nullable().optional(),
  ai_extraction: z.unknown().optional(),
  ai_confidence: z.enum(["high", "medium", "low"]).nullable().optional(),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }
  const b = parsed.data;

  // image_path must live under the caller's storage folder — otherwise a user
  // could attach another user's photo to their own receipt.
  if (b.image_path && !b.image_path.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: "forbidden_path" }, { status: 403 });
  }

  // RLS enforces user_id = auth.uid() on insert; set it explicitly.
  const { data: receipt, error } = await supabase
    .from("receipts")
    .insert({
      user_id: user.id,
      image_path: b.image_path ?? null,
      vendor: b.vendor ?? null,
      // Default to today rather than null — the export filter (.gte/.lte on
      // receipt_date) drops null-dated rows silently.
      receipt_date: b.receipt_date || todayLocal(),
      amount_total: b.amount_total ?? null,
      currency: b.currency,
      category: b.category,
      department_id: b.department_id,
      notes: b.notes ?? null,
      line_items: b.line_items ?? null,
      ai_extraction: b.ai_extraction ?? null,
      ai_confidence: b.ai_confidence ?? null,
    })
    .select()
    .single();

  if (error || !receipt) {
    console.error("receipts insert failed", error);
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }

  await writeAudit({
    user_id: user.id,
    entity_type: "receipt",
    entity_id: receipt.id,
    action: "create",
    after_state: receipt,
  });

  return NextResponse.json(receipt, { status: 201 });
}
