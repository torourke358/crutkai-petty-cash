import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth";
import ReceiptDetail, {
  type AuditEntry,
} from "@/components/ReceiptDetail";
import type { Department, Receipt } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ReceiptDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const role = await getUserRole();

  const { data: receipt } = await supabase
    .from("receipts")
    .select()
    .eq("id", id)
    .single<Receipt>();
  if (!receipt) notFound();

  const [{ data: departments }, signedResult] = await Promise.all([
    supabase
      .from("departments")
      .select("id, code, name, display_order, active")
      .eq("active", true)
      .order("display_order")
      .returns<Department[]>(),
    // Manual entries have no image_path, so only sign when one exists.
    receipt.image_path
      ? supabase.storage.from("receipts").createSignedUrl(receipt.image_path, 300)
      : Promise.resolve({ data: null }),
  ]);
  const signed = signedResult.data;

  // Who uploaded this receipt (shown to everyone on the detail screen).
  const { data: uploader } = await supabase
    .from("user_profiles")
    .select("full_name")
    .eq("id", receipt.user_id)
    .single();
  const uploaderName = uploader?.full_name ?? "Unknown";

  // Audit history is admin-only (RLS also blocks crew reads of audit_log).
  let audit: AuditEntry[] = [];
  if (role === "admin") {
    const { data: rows } = await supabase
      .from("audit_log")
      .select("id, action, created_at, user_id")
      .eq("entity_type", "receipt")
      .eq("entity_id", id)
      .order("created_at", { ascending: false })
      .returns<Omit<AuditEntry, "userName">[]>();

    const userIds = [...new Set((rows ?? []).map((r) => r.user_id))].filter(
      Boolean,
    ) as string[];
    const { data: profiles } = await supabase
      .from("user_profiles")
      .select("id, full_name")
      .in(
        "id",
        userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"],
      );
    const nameById = new Map(
      (profiles ?? []).map((p) => [p.id, p.full_name] as const),
    );

    audit = (rows ?? []).map((r) => ({
      ...r,
      userName: (r.user_id && nameById.get(r.user_id)) || "Unknown",
    }));
  }

  return (
    <ReceiptDetail
      receipt={receipt}
      departments={departments ?? []}
      imageUrl={signed?.signedUrl ?? null}
      isAdmin={role === "admin"}
      uploaderName={uploaderName}
      audit={audit}
    />
  );
}
