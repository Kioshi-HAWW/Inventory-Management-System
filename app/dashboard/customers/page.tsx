import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import CustomersClient from '@/components/customers/CustomersClient';
import type { Customer } from '@/lib/types/projects';

export const metadata = { title: 'Customers & Clients — VoltDesk' };

export default async function CustomersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role,business_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.business_id) redirect('/dashboard');

  const { data: customers } = await supabase
    .from('customers')
    .select('*')
    .eq('business_id', profile.business_id)
    .order('name');

  return (
    <CustomersClient
      customers={(customers ?? []) as Customer[]}
      userRole={profile.role ?? 'employee'}
    />
  );
}
