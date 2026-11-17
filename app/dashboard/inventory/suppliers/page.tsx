import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SuppliersClient from '@/components/inventory/SuppliersClient'

export default async function SuppliersPage() {
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
    .select('*')
    .order('name')

  return (
    <SuppliersClient
      suppliers={suppliers ?? []}
      userRole={profile.role ?? 'employee'}
    />
  )
}
