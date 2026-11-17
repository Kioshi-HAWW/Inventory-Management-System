import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ProductDetailClient from "@/components/inventory/ProductDetailClient";
import type { Product, Category } from "@/lib/types/inventory";

export const metadata = { title: "Product Detail — VoltDesk" };

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ProductDetailPage({ params }: Props) {
  const { id } = await params;
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

  const [{ data: product }, { data: categories }] = await Promise.all([
    supabase
      .from("products")
      .select("id,name,sku,unit,current_stock,reserved_stock,minimum_stock,cost_price,selling_price,latest_purchase_price,is_active,category_id,business_id,description,created_at,updated_at,categories(name)")
      .eq("id", id)
      .eq("business_id", businessId)
      .maybeSingle(),
    supabase
      .from("categories")
      .select("id,name,business_id,description,created_at")
      .eq("business_id", businessId)
      .order("name"),
  ]);

  if (!product) notFound();

  return (
    <ProductDetailClient
      product={product as unknown as Product}
      categories={(categories ?? []) as Category[]}
      userRole={profile.role ?? "employee"}
    />
  );
}
