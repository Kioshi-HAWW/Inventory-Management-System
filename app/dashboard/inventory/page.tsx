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

  // Single parallel fetch for products and categories (low stock derived in-memory)
  const [
    { data: products },
    { data: categories },
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
  ]);

  const rawProducts = (products ?? []) as any[];

  // Compute low stock in-memory (0ms database overhead)
  const lowStockProducts: LowStockProduct[] = rawProducts
    .filter((p) => Number(p.minimum_stock) > 0 && Number(p.current_stock) <= Number(p.minimum_stock))
    .map((p) => ({
      id: p.id,
      business_id: businessId,
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
      products={rawProducts as unknown as Product[]}
      categories={(categories ?? []) as Category[]}
      businessId={businessId}
      userRole={profile.role ?? "employee"}
      lowStock={lowStockProducts}
    />
  );
}
