import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth";
import ReceiptsList, { type ReceiptCard } from "@/components/ReceiptsList";
import type { Department, Client } from "@/lib/types";

export const dynamic = "force-dynamic";

interface ReceiptRow {
  id: string;
  user_id: string;
  vendor: string | null;
  amount_total: number | null;
  currency: string;
  receipt_date: string | null;
  image_path: string;
  department_id: string | null;
  department: { code: string; name: string } | null;
}

export default async function ReceiptsPage() {
  const supabase = await createClient();
  const role = await getUserRole();

  // RLS already scopes crew to their own rows and lets admins see all,
  // so we don't filter by user_id here.
  const [{ data: receipts }, { data: departments }, { data: clients }] =
    await Promise.all([
      supabase
        .from("receipts")
        .select(
          "id, user_id, vendor, amount_total, currency, receipt_date, image_path, department_id, department:departments(code, name)",
        )
        .order("created_at", { ascending: false })
        .limit(30)
        .returns<ReceiptRow[]>(),
      supabase
        .from("departments")
        .select("id, code, name, display_order, active")
        .eq("active", true)
        .order("display_order")
        .returns<Department[]>(),
      supabase
        .from("clients")
        .select("id, name, is_overhead, active, display_order")
        .eq("active", true)
        .order("display_order")
        .order("name")
        .returns<Client[]>(),
    ]);

  const rows = receipts ?? [];

  // Sign every thumbnail in one round trip (60s is plenty for a page render).
  const paths = rows.map((r) => r.image_path);
  const signed =
    paths.length > 0
      ? ((
          await supabase.storage.from("receipts").createSignedUrls(paths, 60)
        ).data ?? [])
      : [];
  const urlByPath = new Map(
    signed.map((s) => [s.path ?? "", s.signedUrl] as const),
  );

  // For admins, resolve uploader names so the list can show who submitted each.
  const isAdmin = role === "admin";
  let nameById = new Map<string, string | null>();
  if (isAdmin) {
    const userIds = [...new Set(rows.map((r) => r.user_id))];
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("user_profiles")
        .select("id, full_name")
        .in("id", userIds);
      nameById = new Map(
        (profiles ?? []).map((p) => [p.id, p.full_name] as const),
      );
    }
  }

  const cards: ReceiptCard[] = rows.map((r) => ({
    id: r.id,
    vendor: r.vendor,
    amount_total: r.amount_total,
    currency: r.currency,
    receipt_date: r.receipt_date,
    departmentId: r.department_id,
    departmentCode: r.department?.code ?? null,
    departmentName: r.department?.name ?? null,
    thumbnailUrl: urlByPath.get(r.image_path) ?? null,
    uploaderName: isAdmin ? (nameById.get(r.user_id) ?? "Unknown") : null,
  }));

  return (
    <ReceiptsList
      cards={cards}
      departments={departments ?? []}
      clients={clients ?? []}
      isAdmin={role === "admin"}
    />
  );
}
