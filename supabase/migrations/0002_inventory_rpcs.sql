-- VoltDesk ERP v1.1 | Inventory Management RPCs
-- Run this after 0001_initial_schema.sql

-- ─────────────────────────────────────────────
-- RPC: purchase_stock
-- Atomically records a full purchase:
--   1. Inserts into purchases
--   2. Inserts purchase_items
--   3. Updates products.current_stock (FOR UPDATE row lock)
--   4. Updates products.cost_price (triggers price_history via trigger)
--   5. Inserts stock_transactions (type = 'purchase')
--   6. Inserts audit_log
-- Input: purchase header + JSON array of line items
-- ─────────────────────────────────────────────
create or replace function public.purchase_stock(
  p_supplier_id        uuid,
  p_purchase_number    text,
  p_purchase_date      date,
  p_notes              text,
  p_items              jsonb   -- [{product_id, quantity, unit_cost}]
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  b               uuid;
  purchase_id     uuid;
  item            jsonb;
  v_product_id    uuid;
  v_qty           numeric;
  v_unit_cost     numeric;
  v_subtotal      numeric := 0;
  v_line_total    numeric;
begin
  b := public.current_business_id();
  if b is null then raise exception 'Business setup required'; end if;
  if not public.is_business_admin() then raise exception 'Only managers and owners can record purchases'; end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'At least one line item is required'; end if;
  if nullif(trim(p_purchase_number), '') is null then raise exception 'Purchase number is required'; end if;

  -- Insert purchase header
  insert into public.purchases(
    business_id, supplier_id, purchase_number, purchase_date, notes, created_by
  ) values(
    b, p_supplier_id, trim(p_purchase_number), coalesce(p_purchase_date, current_date), p_notes, auth.uid()
  ) returning id into purchase_id;

  -- Process each line item
  for item in select * from jsonb_array_elements(p_items) loop
    v_product_id := (item->>'product_id')::uuid;
    v_qty        := (item->>'quantity')::numeric;
    v_unit_cost  := (item->>'unit_cost')::numeric;

    if v_qty <= 0 then raise exception 'Item quantity must be greater than zero'; end if;
    if v_unit_cost < 0 then raise exception 'Unit cost cannot be negative'; end if;

    -- Verify product belongs to this business (lock row)
    if not exists(
      select 1 from public.products
      where id = v_product_id and business_id = b and is_active = true
      for update
    ) then
      raise exception 'Product % not found or inactive', v_product_id;
    end if;

    v_line_total := round(v_qty * v_unit_cost, 2);
    v_subtotal   := v_subtotal + v_line_total;

    -- Insert purchase line item
    insert into public.purchase_items(business_id, purchase_id, product_id, quantity, unit_cost)
    values(b, purchase_id, v_product_id, v_qty, v_unit_cost);

    -- Increment stock (trigger captures price change if cost_price changed)
    update public.products
    set
      current_stock = current_stock + v_qty,
      cost_price    = v_unit_cost,
      updated_at    = now()
    where id = v_product_id and business_id = b;

    -- Insert stock ledger entry
    insert into public.stock_transactions(
      business_id, product_id, transaction_type, quantity,
      unit_cost, reference_table, reference_id, notes, created_by
    ) values(
      b, v_product_id, 'purchase', v_qty,
      v_unit_cost, 'purchases', purchase_id, p_notes, auth.uid()
    );
  end loop;

  -- Update purchase totals
  update public.purchases
  set subtotal = v_subtotal, total_amount = v_subtotal
  where id = purchase_id and business_id = b;

  -- Audit
  insert into public.audit_logs(business_id, actor_id, action, entity_type, entity_id, details)
  values(b, auth.uid(), 'purchase_stock', 'purchases', purchase_id,
    jsonb_build_object('purchase_number', p_purchase_number, 'item_count', jsonb_array_length(p_items), 'subtotal', v_subtotal));

  return purchase_id;
end; $$;

revoke all on function public.purchase_stock(uuid, text, date, text, jsonb) from public;
grant execute on function public.purchase_stock(uuid, text, date, text, jsonb) to authenticated;


-- ─────────────────────────────────────────────
-- RPC: adjust_stock
-- Manual stock adjustment (admin only).
-- p_direction: 'in' (adjustment_in) or 'out' (adjustment_out)
-- ─────────────────────────────────────────────
create or replace function public.adjust_stock(
  p_product_id  uuid,
  p_quantity    numeric,
  p_direction   text,    -- 'in' | 'out'
  p_notes       text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  b        uuid;
  tx_id    uuid;
  txn_type public.stock_txn_type;
begin
  b := public.current_business_id();
  if b is null then raise exception 'Business setup required'; end if;
  if not public.is_business_admin() then raise exception 'Only managers and owners can adjust stock'; end if;
  if p_quantity <= 0 then raise exception 'Quantity must be greater than zero'; end if;
  if p_direction not in ('in','out') then raise exception 'Direction must be ''in'' or ''out'''; end if;

  txn_type := case p_direction when 'in' then 'adjustment_in'::public.stock_txn_type else 'adjustment_out'::public.stock_txn_type end;

  -- Lock product row
  if not exists(
    select 1 from public.products
    where id = p_product_id and business_id = b and is_active = true
    for update
  ) then
    raise exception 'Product not found or inactive';
  end if;

  if p_direction = 'out' then
    update public.products
    set current_stock = current_stock - p_quantity, updated_at = now()
    where id = p_product_id and business_id = b and current_stock >= p_quantity;
    if not found then raise exception 'Insufficient stock for adjustment'; end if;
  else
    update public.products
    set current_stock = current_stock + p_quantity, updated_at = now()
    where id = p_product_id and business_id = b;
  end if;

  insert into public.stock_transactions(
    business_id, product_id, transaction_type, quantity,
    unit_cost, notes, created_by
  )
  select b, p_product_id, txn_type, p_quantity,
         cost_price, p_notes, auth.uid()
  from public.products where id = p_product_id and business_id = b
  returning id into tx_id;

  insert into public.audit_logs(business_id, actor_id, action, entity_type, entity_id, details)
  values(b, auth.uid(), 'adjust_stock', 'stock_transactions', tx_id,
    jsonb_build_object('product_id', p_product_id, 'direction', p_direction, 'quantity', p_quantity));

  return tx_id;
end; $$;

revoke all on function public.adjust_stock(uuid, numeric, text, text) from public;
grant execute on function public.adjust_stock(uuid, numeric, text, text) to authenticated;


-- ─────────────────────────────────────────────
-- RPC: upsert_product
-- Create or update a product safely.
-- - On update: blocks hard-delete if ledger entries exist (use is_active=false).
-- - Price changes are captured by existing trigger.
-- ─────────────────────────────────────────────
create or replace function public.upsert_product(
  p_id           uuid    default null,  -- null = create new
  p_name         text    default null,
  p_sku          text    default null,
  p_description  text    default null,
  p_category_id  uuid    default null,
  p_unit         text    default 'pcs',
  p_minimum_stock  numeric default 0,
  p_cost_price   numeric default 0,
  p_selling_price numeric default 0,
  p_is_active    boolean default true
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  b          uuid;
  product_id uuid;
begin
  b := public.current_business_id();
  if b is null then raise exception 'Business setup required'; end if;
  if not public.is_business_admin() then raise exception 'Only managers and owners can manage products'; end if;
  if nullif(trim(p_name), '') is null then raise exception 'Product name is required'; end if;
  if p_cost_price < 0 then raise exception 'Cost price cannot be negative'; end if;
  if p_selling_price < 0 then raise exception 'Selling price cannot be negative'; end if;
  if p_minimum_stock < 0 then raise exception 'Minimum stock cannot be negative'; end if;

  -- Validate category belongs to same business
  if p_category_id is not null and not exists(
    select 1 from public.categories where id = p_category_id and business_id = b
  ) then
    raise exception 'Category not found';
  end if;

  if p_id is null then
    -- Create new product
    insert into public.products(
      business_id, name, sku, description, category_id, unit,
      minimum_stock, cost_price, selling_price, is_active
    ) values(
      b, trim(p_name), nullif(trim(coalesce(p_sku,'')), ''), p_description, p_category_id,
      coalesce(nullif(trim(p_unit),''), 'pcs'),
      coalesce(p_minimum_stock, 0), coalesce(p_cost_price, 0),
      coalesce(p_selling_price, 0), coalesce(p_is_active, true)
    ) returning id into product_id;

    -- Record opening price_history entries
    insert into public.price_history(business_id, product_id, price_type, old_price, new_price, changed_by, note)
    values(b, product_id, 'cost', null, coalesce(p_cost_price,0), auth.uid(), 'Initial price');
    if coalesce(p_selling_price, 0) > 0 then
      insert into public.price_history(business_id, product_id, price_type, old_price, new_price, changed_by, note)
      values(b, product_id, 'selling', null, p_selling_price, auth.uid(), 'Initial price');
    end if;
  else
    -- Update existing product
    if not exists(select 1 from public.products where id = p_id and business_id = b) then
      raise exception 'Product not found';
    end if;

    -- price_history is captured automatically by the products_capture_price_changes trigger
    update public.products set
      name          = trim(p_name),
      sku           = nullif(trim(coalesce(p_sku,'')), ''),
      description   = p_description,
      category_id   = p_category_id,
      unit          = coalesce(nullif(trim(p_unit),''), 'pcs'),
      minimum_stock = coalesce(p_minimum_stock, 0),
      cost_price    = coalesce(p_cost_price, cost_price),
      selling_price = coalesce(p_selling_price, selling_price),
      is_active     = coalesce(p_is_active, is_active),
      updated_at    = now()
    where id = p_id and business_id = b;

    product_id := p_id;
  end if;

  insert into public.audit_logs(business_id, actor_id, action, entity_type, entity_id, details)
  values(b, auth.uid(),
    case when p_id is null then 'create_product' else 'update_product' end,
    'products', product_id,
    jsonb_build_object('name', p_name, 'sku', p_sku));

  return product_id;
end; $$;

revoke all on function public.upsert_product(uuid,text,text,text,uuid,text,numeric,numeric,numeric,boolean) from public;
grant execute on function public.upsert_product(uuid,text,text,text,uuid,text,numeric,numeric,numeric,boolean) to authenticated;


-- ─────────────────────────────────────────────
-- RPC: soft_delete_product
-- Sets is_active = false. Hard delete is blocked if any
-- stock_transactions reference the product.
-- ─────────────────────────────────────────────
create or replace function public.soft_delete_product(p_product_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  b uuid;
begin
  b := public.current_business_id();
  if b is null then raise exception 'Business setup required'; end if;
  if public.current_user_role() <> 'owner' then raise exception 'Only the owner can delete products'; end if;
  if not exists(select 1 from public.products where id = p_product_id and business_id = b) then
    raise exception 'Product not found';
  end if;
  if exists(select 1 from public.stock_transactions where product_id = p_product_id and business_id = b limit 1) then
    -- Soft delete — preserve history
    update public.products set is_active = false, updated_at = now()
    where id = p_product_id and business_id = b;
  else
    -- No transactions — safe to hard delete
    delete from public.products where id = p_product_id and business_id = b;
  end if;
  insert into public.audit_logs(business_id, actor_id, action, entity_type, entity_id, details)
  values(b, auth.uid(), 'delete_product', 'products', p_product_id, '{}'::jsonb);
end; $$;

revoke all on function public.soft_delete_product(uuid) from public;
grant execute on function public.soft_delete_product(uuid) to authenticated;


-- ─────────────────────────────────────────────
-- RPC: upsert_category
-- ─────────────────────────────────────────────
create or replace function public.upsert_category(
  p_id          uuid   default null,
  p_name        text   default null,
  p_description text   default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  b   uuid;
  cid uuid;
begin
  b := public.current_business_id();
  if b is null then raise exception 'Business setup required'; end if;
  if not public.is_business_admin() then raise exception 'Only managers and owners can manage categories'; end if;
  if nullif(trim(p_name), '') is null then raise exception 'Category name is required'; end if;

  if p_id is null then
    insert into public.categories(business_id, name, description)
    values(b, trim(p_name), p_description) returning id into cid;
  else
    if not exists(select 1 from public.categories where id = p_id and business_id = b) then
      raise exception 'Category not found';
    end if;
    update public.categories set name = trim(p_name), description = p_description
    where id = p_id and business_id = b;
    cid := p_id;
  end if;
  return cid;
end; $$;

revoke all on function public.upsert_category(uuid,text,text) from public;
grant execute on function public.upsert_category(uuid,text,text) to authenticated;


-- ─────────────────────────────────────────────
-- RPC: upsert_supplier
-- ─────────────────────────────────────────────
create or replace function public.upsert_supplier(
  p_id             uuid   default null,
  p_name           text   default null,
  p_contact_person text   default null,
  p_phone          text   default null,
  p_email          text   default null,
  p_gstin          text   default null,
  p_address        text   default null,
  p_notes          text   default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  b   uuid;
  sid uuid;
begin
  b := public.current_business_id();
  if b is null then raise exception 'Business setup required'; end if;
  if not public.is_business_admin() then raise exception 'Only managers and owners can manage suppliers'; end if;
  if nullif(trim(p_name), '') is null then raise exception 'Supplier name is required'; end if;

  if p_id is null then
    insert into public.suppliers(business_id, name, contact_person, phone, email, gstin, address, notes)
    values(b, trim(p_name), p_contact_person, p_phone, p_email, p_gstin, p_address, p_notes)
    returning id into sid;
  else
    if not exists(select 1 from public.suppliers where id = p_id and business_id = b) then
      raise exception 'Supplier not found';
    end if;
    update public.suppliers set
      name = trim(p_name), contact_person = p_contact_person, phone = p_phone,
      email = p_email, gstin = p_gstin, address = p_address, notes = p_notes
    where id = p_id and business_id = b;
    sid := p_id;
  end if;
  return sid;
end; $$;

revoke all on function public.upsert_supplier(uuid,text,text,text,text,text,text,text) from public;
grant execute on function public.upsert_supplier(uuid,text,text,text,text,text,text,text) to authenticated;


-- ─────────────────────────────────────────────
-- View: low_stock_products
-- Convenience view for the realtime low-stock dashboard widget.
-- ─────────────────────────────────────────────
create or replace view public.low_stock_products with (security_invoker = true) as
  select p.id, p.business_id, p.name, p.sku, p.unit,
         p.current_stock, p.minimum_stock,
         p.cost_price, p.selling_price,
         c.name as category_name
  from public.products p
  left join public.categories c on c.id = p.category_id and c.business_id = p.business_id
  where p.is_active = true
    and p.minimum_stock > 0
    and p.current_stock <= p.minimum_stock;

-- Additional index for purchase queries
create index if not exists purchases_business_date_idx on public.purchases(business_id, purchase_date desc);
create index if not exists purchase_items_product_idx on public.purchase_items(business_id, product_id);
create index if not exists suppliers_business_idx on public.suppliers(business_id);
create index if not exists categories_business_idx on public.categories(business_id);
