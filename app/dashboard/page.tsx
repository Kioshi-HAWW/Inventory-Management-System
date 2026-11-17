import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DashboardShell from "@/components/dashboard-shell";
import BusinessOnboarding from "@/components/business-onboarding";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("full_name,role,business_id").eq("id", user.id).maybeSingle();
  if (!profile?.business_id) return <BusinessOnboarding email={user.email ?? ""} />;
  const [{ data: products }, { data: projects }, { data: invoices }] = await Promise.all([
    supabase.from("products").select("id,name,current_stock,minimum_stock,unit,cost_price").limit(1000),
    supabase.from("projects").select("id,status").limit(1000),
    supabase.from("invoices").select("id,total_amount,amount_paid,payment_status,created_at").limit(1000),
  ]);
  const productRows = products ?? []; const invoiceRows = invoices ?? [];
  const totalStockValue = productRows.reduce((sum, p) => sum + Number(p.current_stock ?? 0) * Number(p.cost_price ?? 0), 0);
  const revenue = invoiceRows.reduce((sum, inv) => sum + Number(inv.total_amount ?? 0), 0);
  const outstanding = invoiceRows.filter(i => i.payment_status !== "paid").reduce((sum, i) => sum + Math.max(0, Number(i.total_amount ?? 0) - Number(i.amount_paid ?? 0)), 0);
  const alerts = productRows.filter(p => Number(p.minimum_stock) > 0 && Number(p.current_stock) <= Number(p.minimum_stock)).slice(0,5);
  return <DashboardShell user={{email:user.email ?? "",name:profile?.full_name ?? user.user_metadata?.full_name ?? "Business owner",role:profile?.role ?? "owner"}} stats={{products:productRows.length,projects:(projects ?? []).filter(p=>p.status === "active").length,invoices:invoiceRows.length,stockValue:totalStockValue,revenue,outstanding}} alerts={alerts} />;
}
