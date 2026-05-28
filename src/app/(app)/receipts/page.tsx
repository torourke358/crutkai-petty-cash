import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth";
import ReceiptsList, { type ReceiptCard } from "@/components/ReceiptsList";
import type { Department } from "@/lib/types";

export const dynamic = "force-dynamic";

interface ReceiptRow {
  id: string;
  user_id: string;
  vendor: string | null;
  amount_total: number | null;
  currency: string;
  receipt_date: string | null;
  image_path: string | null;
  notes: string | null;
  department_id: string | null;
  department: { code: string; name: string } | null;
}

export default async function ReceiptsPage() {
  const supabase = await createClient();
  const role = await getUserRole();

  // RLS already scopes crew to their own rows and lets admins see all,
  // so we don't filter by user_id here.
  const [{ data: receipts }, { data: departments }] = await Promise.all([
    supabase
      .from("receipts")
      .select(
        "id, user_id, vendor, amount_total, currency, receipt_date, image_path, notes, department_id, department:departments(code, name)",
      )
      // Load a wide window so client-side search + date filtering can reach
      // back across real history (e.g. searching February later in the year).
      .order("created_at", { ascending: false })
      .limit(500)
      .returns<ReceiptRow[]>(),
    supabase
      .from("departments")
      .select("id, code, name, display_order, active")
      .eq("active", true)
      .order("display_order")
      .returns<Department[]>(),
  ]);

  const rows = receipts ?? [];

  // Sign thumbnails in one round trip; manual entries have no image_path.
  const paths = rows
    .map((r) => r.image_path)
    .filter((p): p is string => !!p);
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
    notes: r.notes,
    departmentId: r.department_id,
    departmentCode: r.department?.code ?? null,
    departmentName: r.department?.name ?? null,
    thumbnailUrl: r.image_path ? (urlByPath.get(r.image_path) ?? null) : null,
    hasImage: !!r.image_path,
    uploaderName: isAdmin ? (nameById.get(r.user_id) ?? "Unknown") : null,
  }));

  return (
    <ReceiptsList
      cards={cards}
      departments={departments ?? []}
      isAdmin={role === "admin"}
    />
  );
}
