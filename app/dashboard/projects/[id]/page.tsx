import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import ProjectDetailClient from '@/components/projects/ProjectDetailClient';
import type { Project, Customer, ProjectMaterial } from '@/lib/types/projects';

export const metadata = { title: 'Project Details & Materials — VoltDesk' };

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ProjectDetailPage({ params }: Props) {
  const { id } = await params;
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
  const businessId = profile.business_id;

  const [
    { data: project },
    { data: customers },
    { data: materials },
    { data: transactions },
    { data: products },
  ] = await Promise.all([
    supabase
      .from('projects')
      .select('id,business_id,customer_id,project_code,name,site_address,start_date,expected_end_date,status,notes,created_at,updated_at,customers(name,phone)')
      .eq('id', id)
      .eq('business_id', businessId)
      .maybeSingle(),
    supabase
      .from('customers')
      .select('id,business_id,name,phone,email,gstin,billing_address,shipping_address,notes,created_at')
      .eq('business_id', businessId)
      .order('name'),
    supabase
      .from('project_materials')
      .select('id,business_id,project_id,product_id,quantity_issued,quantity_returned,unit_cost_snapshot,notes,created_at,updated_at,products(name,unit,current_stock,sku)')
      .eq('project_id', id)
      .eq('business_id', businessId)
      .order('created_at', { ascending: false }),
    supabase
      .from('stock_transactions')
      .select('id,transaction_type,quantity,unit_cost,notes,created_at,products(name,unit,sku)')
      .eq('project_id', id)
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('products')
      .select('id,name,unit,current_stock,cost_price,sku')
      .eq('business_id', businessId)
      .eq('is_active', true)
      .order('name'),
  ]);

  if (!project) notFound();

  const formattedProject: Project = {
    id: project.id,
    business_id: project.business_id,
    customer_id: project.customer_id,
    project_code: project.project_code,
    name: project.name,
    site_address: project.site_address,
    start_date: project.start_date,
    expected_end_date: project.expected_end_date,
    status: project.status,
    notes: project.notes,
    created_at: project.created_at,
    updated_at: project.updated_at,
    customers: Array.isArray(project.customers) ? project.customers[0] ?? null : project.customers ?? null,
  };

  const formattedMaterials: ProjectMaterial[] = (materials ?? []).map((m: any) => ({
    id: m.id,
    business_id: m.business_id,
    project_id: m.project_id,
    product_id: m.product_id,
    quantity_issued: Number(m.quantity_issued || 0),
    quantity_returned: Number(m.quantity_returned || 0),
    unit_cost_snapshot: Number(m.unit_cost_snapshot || 0),
    notes: m.notes,
    created_at: m.created_at,
    updated_at: m.updated_at,
    products: Array.isArray(m.products) ? m.products[0] ?? null : m.products ?? null,
  }));

  const formattedTransactions = (transactions ?? []).map((tx: any) => ({
    id: tx.id,
    transaction_type: tx.transaction_type,
    quantity: Number(tx.quantity || 0),
    unit_cost: Number(tx.unit_cost || 0),
    notes: tx.notes,
    created_at: tx.created_at,
    products: Array.isArray(tx.products) ? tx.products[0] ?? null : tx.products ?? null,
  }));

  return (
    <ProjectDetailClient
      project={formattedProject}
      customers={(customers ?? []) as Customer[]}
      materials={formattedMaterials}
      transactions={formattedTransactions}
      availableProducts={(products ?? []) as any}
      userRole={profile.role ?? 'employee'}
    />
  );
}
