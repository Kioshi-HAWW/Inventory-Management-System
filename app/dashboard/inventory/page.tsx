import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ProductListClient from "@/components/inventory/ProductListClient";
import type { Product, Category, LowStockProduct } from "@/lib/types/inventory";

export const metadata = { title: "Inventory — VoltDesk" };

export default async function InventoryPage() {
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

  const [
    { data: products },
    { data: categories },
    { data: lowStock },
  ] = await Promise.all([
    supabase
      .from("products")
      .select("id,name,sku,unit,current_stock,reserved_stock,minimum_stock,cost_price,selling_price,latest_purchase_price,is_active,category_id,categories(name)")
      .eq("is_active", true)
      .eq("business_id", businessId)
      .order("name"),
    supabase
      .from("categories")
      .select("id,name,business_id,description,created_at")
      .eq("business_id", businessId)
      .order("name"),
    supabase
      .from("products")
      .select("id,business_id,name,sku,unit,current_stock,minimum_stock,cost_price,selling_price,categories(name)")
      .eq("is_active", true)
      .eq("business_id", businessId)
      .gt("minimum_stock", 0)
      .filter("current_stock", "lte", "minimum_stock"),
  ]);

  // Normalize low stock shape
  const lowStockProducts: LowStockProduct[] = (lowStock ?? []).map((p: any) => ({
    id: p.id,
    business_id: p.business_id,
    name: p.name,
    sku: p.sku ?? null,
    unit: p.unit,
    current_stock: p.current_stock,
    minimum_stock: p.minimum_stock,
    cost_price: p.cost_price,
    selling_price: p.selling_price,
    category_name: p.categories?.name ?? null,
  }));

  return (
    <ProductListClient
      products={(products ?? []) as unknown as Product[]}
      categories={(categories ?? []) as Category[]}
      businessId={businessId}
      userRole={profile.role ?? "employee"}
      lowStock={lowStockProducts}
    />
  );
}
