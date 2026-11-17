import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import CategoriesClient from '@/components/inventory/CategoriesClient'

export default async function CategoriesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('business_id,role')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile?.business_id) redirect('/dashboard')

  const { data: categories } = await supabase
    .from('categories')
    .select('*')
    .order('name')

  const { data: products } = await supabase
    .from('products')
    .select('id,category_id')
    .eq('is_active', true)

  const productCounts: Record<string, number> = {}
  for (const p of products ?? []) {
    if (p.category_id) {
      productCounts[p.category_id] = (productCounts[p.category_id] ?? 0) + 1
    }
  }

  return (
    <CategoriesClient
      categories={categories ?? []}
      productCounts={productCounts}
      userRole={profile.role ?? 'employee'}
    />
  )
}
