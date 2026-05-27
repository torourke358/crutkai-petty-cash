import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth";

const schema = z.object({
  notes_instruction: z.string().trim().max(2000),
});

// Save the admin-editable AI notes guidance. Admin-only (RLS also enforces it).
export async function POST(request: Request) {
  if ((await getUserRole()) !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_failed" }, { status: 422 });
  }

  const supabase = await createClient();
  const { error } = await supabase.from("app_settings").upsert(
    {
      key: "notes_instruction",
      value: parsed.data.notes_instruction,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );

  if (error) {
    console.error("settings upsert failed", error);
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
