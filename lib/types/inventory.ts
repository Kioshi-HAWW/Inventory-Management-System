// VoltDesk ERP — shared TypeScript types for the Inventory module

export type AppRole = 'owner' | 'manager' | 'employee' | 'accountant';
export type StockTxnType =
  | 'opening' | 'purchase' | 'reservation' | 'reservation_release'
  | 'issue' | 'return' | 'adjustment_in' | 'adjustment_out'
  | 'sale' | 'reversal';

export interface Category {
  id: string;
  business_id: string;
  name: string;
  description: string | null;
  created_at: string;
}

export interface Supplier {
  id: string;
  business_id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
}

export interface Product {
  id: string;
  business_id: string;
  category_id: string | null;
  sku: string | null;
  name: string;
  description: string | null;
  unit: string;
  current_stock: number;
  reserved_stock: number;
  minimum_stock: number;
  cost_price: number;
  latest_purchase_price?: number;
  selling_price: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // joined
  category?: { name: string } | null;
}

export interface PriceHistory {
  id: string;
  business_id: string;
  product_id: string;
  price_type: 'cost' | 'selling';
  old_price: number | null;
  new_price: number;
  changed_by: string | null;
  effective_at: string;
  note: string | null;
}

export interface StockTransaction {
  id: string;
  business_id: string;
  product_id: string;
  project_id: string | null;
  transaction_type: StockTxnType;
  quantity: number;
  unit_cost: number;
  reference_table: string | null;
  reference_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  // joined
  product?: { name: string; unit: string } | null;
}

export interface Purchase {
  id: string;
  business_id: string;
  supplier_id: string | null;
  purchase_number: string;
  purchase_date: string;
  subtotal: number;
  discount_amount?: number;
  tax_amount: number;
  other_charges: number;
  total_amount: number;
  payment_status?: 'paid' | 'unpaid' | 'partially_paid';
  notes: string | null;
  created_by: string | null;
  created_at: string;
  // joined
  supplier?: { name: string } | null;
  purchase_items?: PurchaseItem[];
}

export interface PurchaseItem {
  id: string;
  business_id: string;
  purchase_id: string;
  product_id: string;
  quantity: number;
  unit_cost: number;
  line_total: number;
  // joined
  product?: { name: string; unit: string } | null;
}

export interface PurchaseLineInput {
  product_id: string;
  quantity: number;
  unit_cost: number;
}

export interface LowStockProduct {
  id: string;
  business_id: string;
  name: string;
  sku: string | null;
  unit: string;
  current_stock: number;
  minimum_stock: number;
  cost_price: number;
  selling_price: number;
  category_name: string | null;
}
