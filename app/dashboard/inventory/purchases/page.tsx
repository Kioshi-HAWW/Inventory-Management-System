import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PurchasesClient from '@/components/inventory/PurchasesClient'

export default async function PurchasesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('business_id,role')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile?.business_id) redirect('/dashboard')

  const { data: purchases } = await supabase
    .from('purchases')
    .select('id,purchase_number,purchase_date,total_amount,discount_amount,payment_status,notes,created_at,supplier_id,suppliers(name)')
    .order('purchase_date', { ascending: false })
    .limit(200)

  const formattedPurchases = (purchases ?? []).map((p: any) => ({
    id: p.id,
    purchase_number: p.purchase_number,
    purchase_date: p.purchase_date,
    total_amount: p.total_amount,
    discount_amount: p.discount_amount ?? 0,
    payment_status: p.payment_status ?? 'paid',
    notes: p.notes,
    created_at: p.created_at,
    supplier_id: p.supplier_id,
    suppliers: Array.isArray(p.suppliers) ? (p.suppliers[0] ?? null) : (p.suppliers ?? null),
  }))

  return <PurchasesClient purchases={formattedPurchases} />
}
