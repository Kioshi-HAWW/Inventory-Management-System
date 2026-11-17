-- VoltDesk ERP v1.2 | Projects, Customers, and Material Return RPCs
-- Run this after 0003_purchase_and_opening_stock.sql

-- ─────────────────────────────────────────────
-- RPC: upsert_customer
-- ─────────────────────────────────────────────
create or replace function public.upsert_customer(
  p_id               uuid default null,
  p_name             text default null,
  p_phone            text default null,
  p_email            text default null,
  p_gstin            text default null,
  p_billing_address  text default null,
  p_shipping_address text default null,
  p_notes            text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  b   uuid;
  cid uuid;
begin
  b := public.current_business_id();
  if b is null then raise exception 'Business setup required'; end if;
  if not public.is_business_admin() then raise exception 'Only managers and owners can manage customers'; end if;
  if nullif(trim(p_name), '') is null then raise exception 'Customer name is required'; end if;

  if p_id is null then
    insert into public.customers(
      business_id, name, phone, email, gstin, billing_address, shipping_address, notes
    ) values (
      b, trim(p_name), p_phone, p_email, nullif(trim(p_gstin), ''), p_billing_address, p_shipping_address, p_notes
    ) returning id into cid;
  else
    if not exists(select 1 from public.customers where id = p_id and business_id = b) then
      raise exception 'Customer not found';
    end if;

    update public.customers set
      name             = trim(p_name),
      phone            = p_phone,
      email            = p_email,
      gstin            = nullif(trim(p_gstin), ''),
      billing_address  = p_billing_address,
      shipping_address = p_shipping_address,
      notes            = p_notes
    where id = p_id and business_id = b;

    cid := p_id;
  end if;

  insert into public.audit_logs(business_id, actor_id, action, entity_type, entity_id, details)
  values(b, auth.uid(), case when p_id is null then 'create_customer' else 'update_customer' end,
         'customers', cid, jsonb_build_object('name', p_name, 'phone', p_phone));

  return cid;
end; $$;

revoke all on function public.upsert_customer(uuid,text,text,text,text,text,text,text) from public;
grant execute on function public.upsert_customer(uuid,text,text,text,text,text,text,text) to authenticated;


-- ─────────────────────────────────────────────
-- RPC: upsert_project
-- ─────────────────────────────────────────────
create or replace function public.upsert_project(
  p_id                uuid default null,
  p_customer_id       uuid default null,
  p_project_code      text default null,
  p_name              text default null,
  p_site_address      text default null,
  p_start_date        date default null,
  p_expected_end_date date default null,
  p_status            public.project_status default 'planning',
  p_notes             text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  b   uuid;
  pid uuid;
begin
  b := public.current_business_id();
  if b is null then raise exception 'Business setup required'; end if;
  if not public.is_business_admin() then raise exception 'Only managers and owners can manage projects'; end if;
  if nullif(trim(p_name), '') is null then raise exception 'Project name is required'; end if;
  if nullif(trim(p_project_code), '') is null then raise exception 'Project code is required'; end if;

  -- Validate customer belongs to this business if provided
  if p_customer_id is not null and not exists(
    select 1 from public.customers where id = p_customer_id and business_id = b
  ) then
    raise exception 'Customer not found';
  end if;

  if p_id is null then
    -- Check for duplicate project code
    if exists(select 1 from public.projects where business_id = b and project_code = trim(p_project_code)) then
      raise exception 'A project with code % already exists', trim(p_project_code);
    end if;

    insert into public.projects(
      business_id, customer_id, project_code, name, site_address,
      start_date, expected_end_date, status, notes, created_by
    ) values (
      b, p_customer_id, trim(p_project_code), trim(p_name), p_site_address,
      p_start_date, p_expected_end_date, coalesce(p_status, 'planning'), p_notes, auth.uid()
    ) returning id into pid;
  else
    if not exists(select 1 from public.projects where id = p_id and business_id = b) then
      raise exception 'Project not found';
    end if;

    -- Check project code collision with other projects
    if exists(select 1 from public.projects where business_id = b and project_code = trim(p_project_code) and id <> p_id) then
      raise exception 'A project with code % already exists', trim(p_project_code);
    end if;

    update public.projects set
      customer_id       = p_customer_id,
      project_code      = trim(p_project_code),
      name              = trim(p_name),
      site_address      = p_site_address,
      start_date        = p_start_date,
      expected_end_date = p_expected_end_date,
      status            = coalesce(p_status, status),
      notes             = p_notes,
      updated_at        = now()
    where id = p_id and business_id = b;

    pid := p_id;
  end if;

  insert into public.audit_logs(business_id, actor_id, action, entity_type, entity_id, details)
  values(b, auth.uid(), case when p_id is null then 'create_project' else 'update_project' end,
         'projects', pid, jsonb_build_object('name', p_name, 'code', p_project_code, 'status', p_status));

  return pid;
end; $$;

revoke all on function public.upsert_project(uuid,uuid,text,text,text,date,date,public.project_status,text) from public;
grant execute on function public.upsert_project(uuid,uuid,text,text,text,date,date,public.project_status,text) to authenticated;


-- ─────────────────────────────────────────────
-- RPC: return_project_material
-- Atomically returns unused materials from a project back to warehouse inventory.
-- ─────────────────────────────────────────────
create or replace function public.return_project_material(
  p_project_id uuid,
  p_product_id uuid,
  p_quantity   numeric,
  p_notes      text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  b              uuid;
  tx             uuid;
  c              numeric;
  v_issued       numeric;
  v_returned     numeric;
  v_available    numeric;
begin
  b := public.current_business_id();
  if b is null then raise exception 'Business setup required'; end if;
  if p_quantity <= 0 then raise exception 'Return quantity must be greater than zero'; end if;

  -- Lock project material record
  select quantity_issued, quantity_returned, unit_cost_snapshot
  into v_issued, v_returned, c
  from public.project_materials
  where project_id = p_project_id and product_id = p_product_id and business_id = b
  for update;

  if not found then
    raise exception 'No material issuance record found for this product in this project';
  end if;

  v_available := v_issued - v_returned;
  if p_quantity > v_available then
    raise exception 'Cannot return % units: only % units currently issued and not yet returned', p_quantity, v_available;
  end if;

  -- Lock product record and add back stock
  select cost_price into c
  from public.products
  where id = p_product_id and business_id = b and is_active = true
  for update;

  if not found then
    raise exception 'Product not found or inactive';
  end if;

  update public.products
  set current_stock = current_stock + p_quantity,
      updated_at = now()
  where id = p_product_id and business_id = b;

  -- Update project materials record
  update public.project_materials
  set quantity_returned = quantity_returned + p_quantity,
      updated_at = now()
  where project_id = p_project_id and product_id = p_product_id and business_id = b;

  -- Record stock transaction
  insert into public.stock_transactions(
    business_id, product_id, project_id, transaction_type,
    quantity, unit_cost, reference_table, reference_id, notes, created_by
  ) values (
    b, p_product_id, p_project_id, 'return',
    p_quantity, c, 'project_materials', p_project_id, p_notes, auth.uid()
  ) returning id into tx;

  -- Audit log
  insert into public.audit_logs(business_id, actor_id, action, entity_type, entity_id, details)
  values(b, auth.uid(), 'return_material', 'stock_transaction', tx,
         jsonb_build_object('project_id', p_project_id, 'product_id', p_product_id, 'quantity', p_quantity));

  return tx;
end; $$;

revoke all on function public.return_project_material(uuid,uuid,numeric,text) from public;
grant execute on function public.return_project_material(uuid,uuid,numeric,text) to authenticated;
