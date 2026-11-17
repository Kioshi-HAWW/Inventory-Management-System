export type ProjectStatus = 'planning' | 'active' | 'on_hold' | 'completed' | 'cancelled';

export interface Customer {
  id: string;
  business_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  billing_address: string | null;
  shipping_address: string | null;
  notes: string | null;
  created_at: string;
}

export interface Project {
  id: string;
  business_id: string;
  customer_id: string | null;
  project_code: string;
  name: string;
  site_address: string | null;
  start_date: string | null;
  expected_end_date: string | null;
  status: ProjectStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  customers?: { name: string; phone?: string | null } | null;
}

export interface ProjectMaterial {
  id: string;
  business_id: string;
  project_id: string;
  product_id: string;
  quantity_issued: number;
  quantity_returned: number;
  unit_cost_snapshot: number;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  products?: {
    name: string;
    unit: string;
    current_stock: number;
    sku?: string | null;
  } | null;
}
