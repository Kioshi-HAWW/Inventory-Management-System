-- VoltDesk ERP v1.0 | PostgreSQL schema for Supabase
create extension if not exists pgcrypto;

create type public.app_role as enum ('owner','manager','employee','accountant');
create type public.project_status as enum ('planning','active','on_hold','completed','cancelled');
create type public.stock_txn_type as enum ('opening','purchase','reservation','reservation_release','issue','return','adjustment_in','adjustment_out','sale','reversal');
create type public.invoice_status as enum ('draft','issued','partially_paid','paid','overdue','cancelled');

create table public.businesses (
 id uuid primary key default gen_random_uuid(), name text not null, legal_name text, gstin text,
 email text, phone text, address text, city text, state text, pincode text,
 currency text not null default 'INR', timezone text not null default 'Asia/Kolkata',
 owner_user_id uuid not null references auth.users(id) on delete restrict,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 business_id uuid references public.businesses(id) on delete set null,
 full_name text, role public.app_role not null default 'employee', is_active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.categories (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 name text not null, description text, created_at timestamptz not null default now(), unique(business_id,name), unique(id,business_id)
);
create table public.suppliers (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 name text not null, contact_person text, phone text, email text, gstin text, address text, notes text,
 created_at timestamptz not null default now(), unique(id,business_id)
);
create table public.products (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 category_id uuid, sku text, name text not null, description text, unit text not null default 'pcs',
 current_stock numeric(14,3) not null default 0 check(current_stock >= 0), reserved_stock numeric(14,3) not null default 0 check(reserved_stock >= 0),
 minimum_stock numeric(14,3) not null default 0 check(minimum_stock >= 0), cost_price numeric(14,2) not null default 0 check(cost_price >= 0),
 selling_price numeric(14,2) not null default 0 check(selling_price >= 0), is_active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(category_id,business_id) references public.categories(id,business_id), unique(id,business_id), unique(business_id,sku)
);
create table public.price_history (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 product_id uuid not null, price_type text not null check(price_type in ('cost','selling')),
 old_price numeric(14,2), new_price numeric(14,2) not null check(new_price >= 0), changed_by uuid references auth.users(id), effective_at timestamptz not null default now(), note text,
 foreign key(product_id,business_id) references public.products(id,business_id)
);
create table public.customers (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 name text not null, phone text, email text, gstin text, billing_address text, shipping_address text, notes text,
 created_at timestamptz not null default now(), unique(id,business_id)
);
create table public.projects (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 customer_id uuid, project_code text not null, name text not null, site_address text, start_date date, expected_end_date date,
 status public.project_status not null default 'planning', notes text, created_by uuid references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(customer_id,business_id) references public.customers(id,business_id), unique(id,business_id), unique(business_id,project_code)
);
create table public.purchases (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 supplier_id uuid, purchase_number text not null, purchase_date date not null default current_date,
 subtotal numeric(14,2) not null default 0, tax_amount numeric(14,2) not null default 0, other_charges numeric(14,2) not null default 0,
 total_amount numeric(14,2) not null default 0, notes text, created_by uuid references auth.users(id), created_at timestamptz not null default now(),
 foreign key(supplier_id,business_id) references public.suppliers(id,business_id), unique(id,business_id), unique(business_id,purchase_number)
);
create table public.purchase_items (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 purchase_id uuid not null, product_id uuid not null, quantity numeric(14,3) not null check(quantity > 0), unit_cost numeric(14,2) not null check(unit_cost >= 0), line_total numeric(14,2) generated always as (round(quantity * unit_cost,2)) stored,
 foreign key(purchase_id,business_id) references public.purchases(id,business_id), foreign key(product_id,business_id) references public.products(id,business_id)
);
create table public.stock_reservations (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 project_id uuid not null, product_id uuid not null, quantity numeric(14,3) not null check(quantity > 0), status text not null default 'active' check(status in ('active','released','issued')),
 created_by uuid references auth.users(id), created_at timestamptz not null default now(),
 foreign key(project_id,business_id) references public.projects(id,business_id), foreign key(product_id,business_id) references public.products(id,business_id), unique(id,business_id)
);
create table public.stock_transactions (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 product_id uuid not null, project_id uuid, transaction_type public.stock_txn_type not null,
 quantity numeric(14,3) not null check(quantity > 0), unit_cost numeric(14,2) not null default 0,
 reference_table text, reference_id uuid, notes text, created_by uuid references auth.users(id), created_at timestamptz not null default now(),
 foreign key(product_id,business_id) references public.products(id,business_id), foreign key(project_id,business_id) references public.projects(id,business_id)
);
create table public.project_materials (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 project_id uuid not null, product_id uuid not null, quantity_issued numeric(14,3) not null default 0 check(quantity_issued >= 0),
 quantity_returned numeric(14,3) not null default 0 check(quantity_returned >= 0), unit_cost_snapshot numeric(14,2) not null default 0,
 notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(project_id,business_id) references public.projects(id,business_id), foreign key(product_id,business_id) references public.products(id,business_id), unique(project_id,product_id)
);
create table public.invoices (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 project_id uuid, customer_id uuid not null, invoice_number text not null, invoice_date date not null default current_date, due_date date,
 status public.invoice_status not null default 'draft', payment_status text not null default 'unpaid' check(payment_status in ('unpaid','partially_paid','paid')),
 material_subtotal numeric(14,2) not null default 0, labour_charges numeric(14,2) not null default 0, additional_charges numeric(14,2) not null default 0,
 discount_type text check(discount_type in ('amount','percent')), discount_value numeric(14,2) not null default 0,
 tax_rate numeric(7,3) not null default 0, tax_amount numeric(14,2) not null default 0, total_amount numeric(14,2) not null default 0,
 amount_paid numeric(14,2) not null default 0, notes text, terms text, created_by uuid references auth.users(id), issued_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(project_id,business_id) references public.projects(id,business_id), foreign key(customer_id,business_id) references public.customers(id,business_id), unique(id,business_id), unique(business_id,invoice_number)
);
create table public.invoice_items (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 invoice_id uuid not null, product_id uuid, description text not null, unit text not null default 'pcs', quantity numeric(14,3) not null check(quantity > 0),
 unit_price numeric(14,2) not null check(unit_price >= 0), unit_cost_snapshot numeric(14,2) not null default 0,
 line_total numeric(14,2) generated always as (round(quantity * unit_price,2)) stored,
 foreign key(invoice_id,business_id) references public.invoices(id,business_id), foreign key(product_id,business_id) references public.products(id,business_id)
);
create table public.payments (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 invoice_id uuid not null, amount numeric(14,2) not null check(amount > 0), payment_date date not null default current_date,
 method text, reference_number text, notes text, received_by uuid references auth.users(id), created_at timestamptz not null default now(),
 foreign key(invoice_id,business_id) references public.invoices(id,business_id)
);
create table public.audit_logs (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 actor_id uuid references auth.users(id), action text not null, entity_type text not null, entity_id uuid, details jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);

-- Profile row is created on signup. Business membership is assigned only through create_business().
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin insert into public.profiles(id,full_name) values(new.id, coalesce(new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'name')); return new; end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.current_business_id() returns uuid language sql stable security definer set search_path=public as $$
 select business_id from public.profiles where id=auth.uid() and is_active=true limit 1;
$$;
create or replace function public.current_user_role() returns public.app_role language sql stable security definer set search_path=public as $$
 select role from public.profiles where id=auth.uid() and is_active=true limit 1;
$$;
create or replace function public.is_business_admin() returns boolean language sql stable security definer set search_path=public as $$
 select coalesce(public.current_user_role() in ('owner','manager'),false);
$$;

create or replace function public.create_business(p_name text, p_phone text default null, p_email text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare new_business_id uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if nullif(trim(p_name),'') is null then raise exception 'Business name is required'; end if;
 if exists(select 1 from public.profiles where id=auth.uid() and business_id is not null) then raise exception 'Your account already belongs to a business'; end if;
 insert into public.businesses(name,phone,email,owner_user_id) values(trim(p_name),p_phone,p_email,auth.uid()) returning id into new_business_id;
 update public.profiles set business_id=new_business_id, role='owner', is_active=true, updated_at=now() where id=auth.uid();
 return new_business_id;
end; $$;
revoke all on function public.create_business(text,text,text) from public;
grant execute on function public.create_business(text,text,text) to authenticated;

-- Atomic stock issue. Prevents negative stock even when two users issue concurrently.
create or replace function public.issue_project_material(p_project_id uuid,p_product_id uuid,p_quantity numeric,p_notes text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare b uuid; tx uuid; c numeric;
begin
 b:=public.current_business_id();
 if b is null then raise exception 'Business setup required'; end if;
 if p_quantity <= 0 then raise exception 'Quantity must be greater than zero'; end if;
 if not exists(select 1 from public.projects where id=p_project_id and business_id=b) then raise exception 'Project not found'; end if;
 select cost_price into c from public.products where id=p_product_id and business_id=b and is_active=true for update;
 if not found then raise exception 'Product not found'; end if;
 update public.products set current_stock=current_stock-p_quantity, reserved_stock=greatest(0,reserved_stock-p_quantity), updated_at=now()
 where id=p_product_id and business_id=b and current_stock >= p_quantity;
 if not found then raise exception 'Insufficient stock'; end if;
 insert into public.stock_transactions(business_id,product_id,project_id,transaction_type,quantity,unit_cost,notes,created_by)
 values(b,p_product_id,p_project_id,'issue',p_quantity,c,p_notes,auth.uid()) returning id into tx;
 insert into public.project_materials(business_id,project_id,product_id,quantity_issued,unit_cost_snapshot)
 values(b,p_project_id,p_product_id,p_quantity,c)
 on conflict(project_id,product_id) do update set quantity_issued=public.project_materials.quantity_issued+excluded.quantity_issued,updated_at=now();
 insert into public.audit_logs(business_id,actor_id,action,entity_type,entity_id,details)
 values(b,auth.uid(),'issue_material','stock_transaction',tx,jsonb_build_object('project_id',p_project_id,'product_id',p_product_id,'quantity',p_quantity));
 return tx;
end; $$;
revoke all on function public.issue_project_material(uuid,uuid,numeric,text) from public;
grant execute on function public.issue_project_material(uuid,uuid,numeric,text) to authenticated;

-- Enable RLS and enforce business isolation on all business-owned tables.
do $$ declare t text; begin
 foreach t in array array['businesses','profiles','categories','suppliers','products','price_history','customers','projects','purchases','purchase_items','stock_reservations','stock_transactions','project_materials','invoices','invoice_items','payments','audit_logs'] loop
  execute format('alter table public.%I enable row level security',t);
 end loop;
end $$;
create policy "business members read own business" on public.businesses for select to authenticated using(id=public.current_business_id());
create policy "owner can update own business" on public.businesses for update to authenticated using(id=public.current_business_id() and owner_user_id=auth.uid()) with check(id=public.current_business_id() and owner_user_id=auth.uid());
create policy "user reads own profile" on public.profiles for select to authenticated using(id=auth.uid() or business_id=public.current_business_id());
-- Profile role and business membership are changed only by trusted security-definer functions.

do $$ declare t text; begin
 foreach t in array array['categories','suppliers','products','price_history','customers','projects','purchases','purchase_items','stock_reservations','stock_transactions','project_materials','invoices','invoice_items','payments','audit_logs'] loop
  execute format('create policy "members read %1$s" on public.%1$I for select to authenticated using (business_id=public.current_business_id())',t);
  execute format('create policy "managers write %1$s" on public.%1$I for insert to authenticated with check (business_id=public.current_business_id() and public.is_business_admin())',t);
  execute format('create policy "managers update %1$s" on public.%1$I for update to authenticated using (business_id=public.current_business_id() and public.is_business_admin()) with check (business_id=public.current_business_id() and public.is_business_admin())',t);
  execute format('create policy "managers delete %1$s" on public.%1$I for delete to authenticated using (business_id=public.current_business_id() and public.current_user_role()=''owner'')',t);
 end loop;
end $$;

-- Record price changes automatically; old prices are never overwritten in the history table.
create or replace function public.capture_product_price_changes() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.cost_price is distinct from old.cost_price then
  insert into public.price_history(business_id,product_id,price_type,old_price,new_price,changed_by) values(new.business_id,new.id,'cost',old.cost_price,new.cost_price,auth.uid());
 end if;
 if new.selling_price is distinct from old.selling_price then
  insert into public.price_history(business_id,product_id,price_type,old_price,new_price,changed_by) values(new.business_id,new.id,'selling',old.selling_price,new.selling_price,auth.uid());
 end if;
 new.updated_at:=now();
 return new;
end; $$;
create trigger products_capture_price_changes before update of cost_price,selling_price on public.products for each row execute procedure public.capture_product_price_changes();

-- Indexes for common dashboard and ledger queries.
create index products_business_name_idx on public.products(business_id,name);
create index products_low_stock_idx on public.products(business_id,current_stock,minimum_stock);
create index stock_transactions_business_date_idx on public.stock_transactions(business_id,created_at desc);
create index stock_transactions_product_idx on public.stock_transactions(business_id,product_id,created_at desc);
create index projects_business_status_idx on public.projects(business_id,status);
create index invoices_business_date_idx on public.invoices(business_id,invoice_date desc);
create index invoices_business_status_idx on public.invoices(business_id,payment_status);
create index payments_invoice_idx on public.payments(business_id,invoice_id);
