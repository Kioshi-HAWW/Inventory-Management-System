import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import InventoryShellClient from "./InventoryShellClient";

export default async function InventoryShell({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name,role,business_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.business_id) redirect("/dashboard");
  return (
    <InventoryShellClient
      user={{
        email: user.email ?? "",
        name: profile?.full_name ?? user.user_metadata?.full_name ?? "User",
        role: profile?.role ?? "employee"
      }}
    >
      {children}
    </InventoryShellClient>
  );
}
