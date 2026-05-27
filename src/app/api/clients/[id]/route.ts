import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  active: z.boolean().optional(),
});

type Ctx = { params: Promise<{ id: string }> };

// Rename or activate/deactivate a client. Admin-only.
export async function PATCH(request: Request, ctx: Ctx) {
  if ((await getUserRole()) !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_failed" }, { status: 422 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .update(parsed.data)
    .eq("id", id)
    .select()
    .single();

  if (error || !data) {
    console.error("client update failed", error);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }
  return NextResponse.json(data);
}
