import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { CURRENCIES } from "@/lib/types";

const patchSchema = z.object({
  vendor: z.string().nullable().optional(),
  receipt_date: z.string().nullable().optional(),
  amount_total: z.number().nullable().optional(),
  currency: z.enum(CURRENCIES).optional(),
  department_id: z.string().uuid().optional(),
  // Accepted but ignored — clients feature is hidden (kept for v2).
  client_id: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
  status: z.enum(["submitted", "verified", "void"]).optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }

  // Capture the before-state (RLS lets owner/admin read it).
  const { data: before } = await supabase
    .from("receipts")
    .select()
    .eq("id", id)
    .single();
  if (!before) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Drop client_id before writing — accepted for compatibility, never stored.
  const normalized: Record<string, unknown> = { ...parsed.data };
  delete normalized.client_id;
  if (parsed.data.receipt_date !== undefined) {
    normalized.receipt_date = parsed.data.receipt_date || null;
  }

  // Use {count: 'exact'} + maybeSingle so an RLS-blocked update surfaces as
  // 403 instead of a generic 500 — and so the audit_log records the denial.
  const { data: after, error, count } = await supabase
    .from("receipts")
    .update(normalized, { count: "exact" })
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) {
    console.error("receipt update failed", error);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }
  if (!count || !after) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  await writeAudit({
    user_id: user.id,
    entity_type: "receipt",
    entity_id: id,
    action: "update",
    before_state: before,
    after_state: after,
  });

  return NextResponse.json(after);
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: before } = await supabase
    .from("receipts")
    .select()
    .eq("id", id)
    .single();
  if (!before) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // RLS allows delete only for admins; a crew request returns 0 rows deleted.
  const { error, count } = await supabase
    .from("receipts")
    .delete({ count: "exact" })
    .eq("id", id);

  if (error) {
    console.error("receipt delete failed", error);
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }
  if (!count) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  await writeAudit({
    user_id: user.id,
    entity_type: "receipt",
    entity_id: id,
    action: "delete",
    before_state: before,
  });

  return NextResponse.json({ ok: true });
}
