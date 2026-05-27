import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth";
import ClientsManager from "@/components/ClientsManager";
import type { Client } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  if ((await getUserRole()) !== "admin") redirect("/receipts");

  const supabase = await createClient();
  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, is_overhead, active, display_order")
    .order("display_order")
    .order("name")
    .returns<Client[]>();

  return <ClientsManager initialClients={clients ?? []} />;
}
