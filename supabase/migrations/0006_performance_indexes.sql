-- Migration 0006: High-performance composite and partial indexes
-- Optimizes product lookup, search, auth checks, stock ledgers, and transactions

-- 1. Profiles & Business Tenancy (checked on every page request)
create index if not exists idx_profiles_business
  on public.profiles(business_id);

-- 2. Products table: partial indexes for active products
-- Greatly speeds up all inventory queries filtering by `is_active = true`
create index if not exists idx_products_active_biz_name
  on public.products(business_id, name)
  where is_active = true;

create index if not exists idx_products_active_sku
  on public.products(business_id, sku)
  where is_active = true and sku is not null;

create index if not exists idx_products_active_category
  on public.products(business_id, category_id)
  where is_active = true;

create index if not exists idx_products_active_low_stock
  on public.products(business_id, current_stock, minimum_stock)
  where is_active = true and minimum_stock > 0 and current_stock <= minimum_stock;

-- 3. Price history lookup for product detail page
create index if not exists idx_price_history_prod_effective
  on public.price_history(product_id, business_id, effective_at desc);

-- 4. Projects and Materials
create index if not exists idx_projects_biz_created
  on public.projects(business_id, created_at desc);

create index if not exists idx_projects_biz_customer
  on public.projects(business_id, customer_id);

create index if not exists idx_project_materials_prod_biz
  on public.project_materials(product_id, business_id);

-- 5. Purchases & Suppliers
create index if not exists idx_purchases_biz_supplier
  on public.purchases(business_id, supplier_id, purchase_date desc);

create index if not exists idx_purchases_biz_status
  on public.purchases(business_id, payment_status);

create index if not exists idx_purchase_items_purchase
  on public.purchase_items(purchase_id, business_id);

-- 6. Customers lookup and search
create index if not exists idx_customers_biz_name
  on public.customers(business_id, name);

create index if not exists idx_customers_biz_phone
  on public.customers(business_id, phone)
  where phone is not null;

create index if not exists idx_customers_biz_gstin
  on public.customers(business_id, gstin)
  where gstin is not null;
