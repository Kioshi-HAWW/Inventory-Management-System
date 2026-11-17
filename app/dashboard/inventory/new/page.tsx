import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ProductFormClient from "@/components/inventory/ProductFormClient";
import type { Category } from "@/lib/types/inventory";

export const metadata = { title: "Add Product — VoltDesk" };

export default async function NewProductPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role,business_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.business_id) redirect("/dashboard");

  const businessId = profile.business_id;

  const { data: categories } = await supabase
    .from("categories")
    .select("id,name,business_id,description,created_at")
    .eq("business_id", businessId)
    .order("name");

  return (
    <ProductFormClient
      mode="create"
      categories={(categories ?? []) as Category[]}
      businessId={businessId}
    />
  );
}
