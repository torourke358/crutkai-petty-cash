import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth";
import { DEFAULT_NOTES_INSTRUCTION } from "@/lib/extraction-prompt";
import AiNotesEditor from "@/components/AiNotesEditor";

export const dynamic = "force-dynamic";

export default async function AiNotesPage() {
  if ((await getUserRole()) !== "admin") redirect("/receipts");

  const supabase = await createClient();
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "notes_instruction")
    .maybeSingle();

  // Show the saved instruction, or the built-in default if none is saved yet.
  const current = data?.value?.trim() || DEFAULT_NOTES_INSTRUCTION;

  return (
    <AiNotesEditor
      current={current}
      defaultInstruction={DEFAULT_NOTES_INSTRUCTION}
    />
  );
}
