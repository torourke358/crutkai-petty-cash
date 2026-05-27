import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth";

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

// Create a new client. Admin-only (RLS also enforces this).
export async function POST(request: Request) {
  if ((await getUserRole()) !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_failed" }, { status: 422 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .insert({ name: parsed.data.name })
    .select()
    .single();

  if (error || !data) {
    console.error("client insert failed", error);
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
