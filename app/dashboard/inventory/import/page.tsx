import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import SmartImportClient from '@/components/inventory/SmartImportClient';

export const metadata = { title: 'Smart Product Import — VoltDesk' };

export default async function SmartImportPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('business_id, role')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.business_id) redirect('/dashboard');
  const businessId = profile.business_id;

  const [{ data: products }, { data: suppliers }, { data: categories }] = await Promise.all([
    supabase
      .from('products')
      .select('id, name, sku, cost_price, selling_price, current_stock, unit')
      .eq('business_id', businessId)
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('suppliers')
      .select('id, name')
      .eq('business_id', businessId)
      .order('name'),
    supabase
      .from('categories')
      .select('id, name')
      .eq('business_id', businessId)
      .order('name'),
  ]);

  return (
    <SmartImportClient
      existingProducts={(products ?? []) as any}
      suppliers={suppliers ?? []}
      categories={categories ?? []}
      userRole={profile.role ?? 'employee'}
    />
  );
}
