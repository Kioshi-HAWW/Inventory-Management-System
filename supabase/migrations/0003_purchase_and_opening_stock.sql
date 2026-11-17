-- VoltDesk ERP v1.2 | Enhanced Purchase Management & Opening Stock
-- Run this after 0002_inventory_rpcs.sql

-- 1. Extend products table with latest_purchase_price
alter table public.products
  add column if not exists latest_purchase_price numeric(14,2) not null default 0 check(latest_purchase_price >= 0);

-- Sync latest_purchase_price with existing cost_price where available
update public.products
set latest_purchase_price = cost_price
where latest_purchase_price = 0 and cost_price > 0;

-- 2. Extend purchases table with discount_amount and payment_status
alter table public.purchases
  add column if not exists discount_amount numeric(14,2) not null default 0 check(discount_amount >= 0),
  add column if not exists payment_status text not null default 'paid' check(payment_status in ('paid','unpaid','partially_paid'));

-- ─────────────────────────────────────────────
-- RPC: upsert_product (enhanced with opening stock migration)
-- ─────────────────────────────────────────────
create or replace function public.upsert_product(
  p_id             uuid    default null,  -- null = create new
  p_name           text    default null,
  p_sku            text    default null,
  p_description    text    default null,
  p_category_id    uuid    default null,
  p_unit           text    default 'pcs',
  p_minimum_stock  numeric default 0,
  p_cost_price     numeric default 0,
  p_selling_price  numeric default 0,
  p_is_active      boolean default true,
  p_opening_stock  numeric default 0,
  p_opening_cost   numeric default 0
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  b               uuid;
  product_id      uuid;
  v_initial_stock numeric := 0;
  v_initial_cost  numeric := 0;
begin
  b := public.current_business_id();
  if b is null then raise exception 'Business setup required'; end if;
  if not public.is_business_admin() then raise exception 'Only managers and owners can manage products'; end if;
  if nullif(trim(p_name), '') is null then raise exception 'Product name is required'; end if;
  if p_cost_price < 0 then raise exception 'Cost price cannot be negative'; end if;
  if p_selling_price < 0 then raise exception 'Selling price cannot be negative'; end if;
  if p_minimum_stock < 0 then raise exception 'Minimum stock cannot be negative'; end if;
  if coalesce(p_opening_stock, 0) < 0 then raise exception 'Opening stock cannot be negative'; end if;
  if coalesce(p_opening_cost, 0) < 0 then raise exception 'Opening cost cannot be negative'; end if;

  -- Validate category belongs to same business
  if p_category_id is not null and not exists(
    select 1 from public.categories where id = p_category_id and business_id = b
  ) then
    raise exception 'Category not found';
  end if;

  if p_id is null then
    -- Initial stock migration setup
    if coalesce(p_opening_stock, 0) > 0 then
      v_initial_stock := p_opening_stock;
      v_initial_cost  := coalesce(p_opening_cost, p_cost_price, 0);
    else
      v_initial_stock := 0;
      v_initial_cost  := coalesce(p_cost_price, 0);
    end if;

    -- Create new product
    insert into public.products(
      business_id, name, sku, description, category_id, unit,
      current_stock, minimum_stock, cost_price, latest_purchase_price, selling_price, is_active
    ) values(
      b, trim(p_name), nullif(trim(coalesce(p_sku,'')), ''), p_description, p_category_id,
      coalesce(nullif(trim(p_unit),''), 'pcs'),
      v_initial_stock,
      coalesce(p_minimum_stock, 0),
      v_initial_cost,
      v_initial_cost,
      coalesce(p_selling_price, 0),
      coalesce(p_is_active, true)
    ) returning id into product_id;

    -- Record opening stock transaction if opening stock was provided
    if v_initial_stock > 0 then
      insert into public.stock_transactions(
        business_id, product_id, transaction_type, quantity,
        unit_cost, notes, created_by
      ) values(
        b, product_id, 'opening', v_initial_stock,
        v_initial_cost, 'Opening stock migration', auth.uid()
      );
    end if;

    -- Record initial price history entries
    if v_initial_cost > 0 then
      insert into public.price_history(business_id, product_id, price_type, old_price, new_price, changed_by, note)
      values(b, product_id, 'cost', null, v_initial_cost, auth.uid(),
        case when v_initial_stock > 0 then 'Opening stock valuation' else 'Initial cost price' end);
    end if;

    if coalesce(p_selling_price, 0) > 0 then
      insert into public.price_history(business_id, product_id, price_type, old_price, new_price, changed_by, note)
      values(b, product_id, 'selling', null, p_selling_price, auth.uid(), 'Default selling price');
    end if;

  else
    -- Update existing product (stock is NOT modified here; use purchase or adjust stock)
    if not exists(select 1 from public.products where id = p_id and business_id = b) then
      raise exception 'Product not found';
    end if;

    update public.products set
      name          = trim(p_name),
      sku           = nullif(trim(coalesce(p_sku,'')), ''),
      description   = p_description,
      category_id   = p_category_id,
      unit          = coalesce(nullif(trim(p_unit),''), 'pcs'),
      minimum_stock = coalesce(p_minimum_stock, 0),
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
    jsonb_build_object('name', p_name, 'sku', p_sku, 'opening_stock', p_opening_stock));

  return product_id;
end; $$;

revoke all on function public.upsert_product(uuid,text,text,text,uuid,text,numeric,numeric,numeric,boolean,numeric,numeric) from public;
grant execute on function public.upsert_product(uuid,text,text,text,uuid,text,numeric,numeric,numeric,boolean,numeric,numeric) to authenticated;


-- ─────────────────────────────────────────────
-- RPC: purchase_stock (enhanced with WAC, discounts, taxes, charges & payment status)
-- ─────────────────────────────────────────────
create or replace function public.purchase_stock(
  p_supplier_id        uuid,
  p_purchase_number    text,
  p_purchase_date      date,
  p_notes              text,
  p_items              jsonb,              -- [{product_id, quantity, unit_cost}]
  p_discount_amount    numeric default 0,
  p_tax_amount         numeric default 0,
  p_other_charges      numeric default 0,
  p_payment_status     text    default 'paid'
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  b               uuid;
  purchase_id     uuid;
  item            jsonb;
  v_product_id    uuid;
  v_qty           numeric;
  v_unit_cost     numeric;
  v_cur_stock     numeric;
  v_cur_cost      numeric;
  v_new_wac       numeric;
  v_subtotal      numeric := 0;
  v_line_total    numeric;
  v_total_amount  numeric;
  v_payment_stat  text;
begin
  b := public.current_business_id();
  if b is null then raise exception 'Business setup required'; end if;
  if not public.is_business_admin() then raise exception 'Only managers and owners can record purchases'; end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'At least one line item is required'; end if;
  if nullif(trim(p_purchase_number), '') is null then raise exception 'Purchase reference / invoice number is required'; end if;
  if coalesce(p_discount_amount, 0) < 0 then raise exception 'Discount cannot be negative'; end if;
  if coalesce(p_tax_amount, 0) < 0 then raise exception 'Tax amount cannot be negative'; end if;
  if coalesce(p_other_charges, 0) < 0 then raise exception 'Additional charges cannot be negative'; end if;

  v_payment_stat := coalesce(p_payment_status, 'paid');
  if v_payment_stat not in ('paid', 'unpaid', 'partially_paid') then
    v_payment_stat := 'paid';
  end if;

  -- Prevent duplicate purchase invoices for the same business
  if exists(
    select 1 from public.purchases
    where business_id = b and purchase_number = trim(p_purchase_number)
  ) then
    raise exception 'Purchase invoice "%" has already been recorded.', trim(p_purchase_number);
  end if;

  -- Insert initial purchase header
  insert into public.purchases(
    business_id, supplier_id, purchase_number, purchase_date,
    subtotal, discount_amount, tax_amount, other_charges, total_amount, payment_status,
    notes, created_by
  ) values(
    b, p_supplier_id, trim(p_purchase_number), coalesce(p_purchase_date, current_date),
    0, coalesce(p_discount_amount, 0), coalesce(p_tax_amount, 0), coalesce(p_other_charges, 0), 0,
    v_payment_stat, p_notes, auth.uid()
  ) returning id into purchase_id;

  -- Process each line item with atomic row locking
  for item in select * from jsonb_array_elements(p_items) loop
    v_product_id := (item->>'product_id')::uuid;
    v_qty        := (item->>'quantity')::numeric;
    v_unit_cost  := (item->>'unit_cost')::numeric;

    if v_qty <= 0 then raise exception 'Item quantity must be greater than zero'; end if;
    if v_unit_cost < 0 then raise exception 'Unit cost cannot be negative'; end if;

    -- Lock product row and retrieve current stock & valuation cost
    select current_stock, cost_price into v_cur_stock, v_cur_cost
    from public.products
    where id = v_product_id and business_id = b and is_active = true
    for update;

    if not found then
      raise exception 'Product % not found or is archived', v_product_id;
    end if;

    v_line_total := round(v_qty * v_unit_cost, 2);
    v_subtotal   := v_subtotal + v_line_total;

    -- Insert purchase line item
    insert into public.purchase_items(business_id, purchase_id, product_id, quantity, unit_cost)
    values(b, purchase_id, v_product_id, v_qty, v_unit_cost);

    -- Calculate Moving Weighted Average Cost (WAC)
    -- Formula: ((Current Stock * Current Cost) + (New Qty * New Unit Cost)) / (Current Stock + New Qty)
    if v_cur_stock <= 0 then
      v_new_wac := v_unit_cost;
    else
      v_new_wac := round(((v_cur_stock * v_cur_cost) + (v_qty * v_unit_cost)) / (v_cur_stock + v_qty), 2);
    end if;

    -- Increment stock, set latest purchase price and update weighted average cost
    update public.products
    set
      current_stock         = current_stock + v_qty,
      cost_price            = v_new_wac,
      latest_purchase_price = v_unit_cost,
      updated_at            = now()
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

  -- Calculate grand total: Subtotal - Discount + Tax + Additional charges
  v_total_amount := round(v_subtotal - coalesce(p_discount_amount, 0) + coalesce(p_tax_amount, 0) + coalesce(p_other_charges, 0), 2);
  if v_total_amount < 0 then
    raise exception 'Calculated grand total cannot be negative';
  end if;

  -- Update purchase header totals
  update public.purchases
  set subtotal = v_subtotal, total_amount = v_total_amount
  where id = purchase_id and business_id = b;

  -- Audit log
  insert into public.audit_logs(business_id, actor_id, action, entity_type, entity_id, details)
  values(b, auth.uid(), 'purchase_stock', 'purchases', purchase_id,
    jsonb_build_object(
      'purchase_number', p_purchase_number,
      'item_count', jsonb_array_length(p_items),
      'subtotal', v_subtotal,
      'discount', p_discount_amount,
      'tax', p_tax_amount,
      'other_charges', p_other_charges,
      'grand_total', v_total_amount,
      'payment_status', v_payment_stat
    )
  );

  return purchase_id;
end; $$;

revoke all on function public.purchase_stock(uuid, text, date, text, jsonb, numeric, numeric, numeric, text) from public;
grant execute on function public.purchase_stock(uuid, text, date, text, jsonb, numeric, numeric, numeric, text) to authenticated;
