-- VoltDesk ERP v1.3 | Fix product delete foreign key constraint & soft delete logic
-- Run this in Supabase SQL Editor

-- 1. Enable CASCADE on price_history foreign key so hard-deleting test products doesn't fail
alter table public.price_history
  drop constraint if exists price_history_product_id_business_id_fkey;

alter table public.price_history
  add constraint price_history_product_id_business_id_fkey
  foreign key (product_id, business_id)
  references public.products(id, business_id)
  on delete cascade;

-- 2. Enhance soft_delete_product RPC
-- If a product has transaction history (stock ledger, purchases, project issues, reservations),
-- it archives it (is_active = false) to protect financial audit integrity.
-- If it has zero transactional history (e.g. test product or newly added catalogue item with 0 stock),
-- it cleanly hard-deletes the product and cascades price history.
create or replace function public.soft_delete_product(p_product_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  b           uuid;
  has_history boolean;
begin
  b := public.current_business_id();
  if b is null then raise exception 'Business setup required'; end if;
  if not public.is_business_admin() then raise exception 'Only managers and owners can delete products'; end if;

  if not exists(select 1 from public.products where id = p_product_id and business_id = b) then
    raise exception 'Product not found';
  end if;

  -- Check if this product has any stock or transactional history
  select exists(
    select 1 from public.stock_transactions where product_id = p_product_id and business_id = b
    union all
    select 1 from public.purchase_items where product_id = p_product_id and business_id = b
    union all
    select 1 from public.project_materials where product_id = p_product_id and business_id = b
    union all
    select 1 from public.stock_reservations where product_id = p_product_id and business_id = b
    limit 1
  ) into has_history;

  if has_history then
    -- Historical transactions exist — archive to preserve accounting and ledger
    update public.products
    set is_active = false, updated_at = now()
    where id = p_product_id and business_id = b;
  else
    -- Zero transaction history — clean hard delete (cascades price_history)
    delete from public.price_history
    where product_id = p_product_id and business_id = b;

    delete from public.products
    where id = p_product_id and business_id = b;
  end if;

  insert into public.audit_logs(business_id, actor_id, action, entity_type, entity_id, details)
  values(b, auth.uid(), 'delete_product', 'products', p_product_id,
         jsonb_build_object('soft_deleted', has_history));
end; $$;

revoke all on function public.soft_delete_product(uuid) from public;
grant execute on function public.soft_delete_product(uuid) to authenticated;
