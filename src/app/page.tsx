import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Entry point: send to the app if signed in, otherwise to login.
export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  redirect(user ? "/receipts" : "/login");
}
