import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth";
import ExportForm from "@/components/ExportForm";
import type { Department } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ExportPage() {
  const role = await getUserRole();
  if (role !== "admin") redirect("/receipts");

  const supabase = await createClient();
  const { data: departments } = await supabase
    .from("departments")
    .select("id, code, name, display_order, active")
    .eq("active", true)
    .order("display_order")
    .returns<Department[]>();

  return <ExportForm departments={departments ?? []} />;
}
