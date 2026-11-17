import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PurchaseFormClient from '@/components/inventory/PurchaseFormClient'

export default async function NewPurchasePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('business_id,role')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile?.business_id) redirect('/dashboard')

  const { data: suppliers } = await supabase
    .from('suppliers')
    .select('id,name')
    .order('name')

  const { data: products } = await supabase
    .from('products')
    .select('id,name,unit,cost_price,sku,current_stock')
    .eq('is_active', true)
    .order('name')

  return (
    <PurchaseFormClient
      suppliers={suppliers ?? []}
      products={products ?? []}
    />
  )
}
