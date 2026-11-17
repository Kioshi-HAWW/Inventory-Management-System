import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import ProjectsListClient from '@/components/projects/ProjectsListClient';
import type { Project, Customer } from '@/lib/types/projects';

export const metadata = { title: 'Projects & Work Orders — VoltDesk' };

export default async function ProjectsPage() {
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

  const [{ data: projects }, { data: customers }] = await Promise.all([
    supabase
      .from('projects')
      .select('id,business_id,customer_id,project_code,name,site_address,start_date,expected_end_date,status,notes,created_at,updated_at,customers(name,phone)')
      .eq('business_id', profile.business_id)
      .order('created_at', { ascending: false }),
    supabase
      .from('customers')
      .select('id,business_id,name,phone,email,gstin,billing_address,shipping_address,notes,created_at')
      .eq('business_id', profile.business_id)
      .order('name'),
  ]);

  const formattedProjects = (projects ?? []).map((p: any) => ({
    id: p.id,
    business_id: p.business_id,
    customer_id: p.customer_id,
    project_code: p.project_code,
    name: p.name,
    site_address: p.site_address,
    start_date: p.start_date,
    expected_end_date: p.expected_end_date,
    status: p.status,
    notes: p.notes,
    created_at: p.created_at,
    updated_at: p.updated_at,
    customers: Array.isArray(p.customers) ? p.customers[0] ?? null : p.customers ?? null,
  }));

  return (
    <ProjectsListClient
      projects={formattedProjects as Project[]}
      customers={(customers ?? []) as Customer[]}
      userRole={profile.role ?? 'employee'}
    />
  );
}
