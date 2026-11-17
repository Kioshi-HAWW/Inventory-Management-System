export type ImportMode = 'catalogue' | 'opening_stock' | 'purchase';

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export type DuplicateAction = 'create' | 'update' | 'skip';

export interface DuplicateMatch {
  type: 'exact_sku' | 'exact_name' | 'similar_name';
  matchedProductId: string;
  matchedProductName: string;
  matchedSku: string | null;
  existingCost: number;
  existingPrice: number;
  existingStock: number;
  score: number; // 0 to 1
  message: string;
}

export interface ExtractedProductRow {
  id: string; // client UUID for table row keys
  name: string;
  sku: string;
  category: string;
  unit: string;
  description: string;
  quantity: number;
  purchase_price: number;
  selling_price: number;
  minimum_stock: number;
  confidence: ConfidenceLevel;
  uncertain_fields: string[]; // e.g. ['selling_price', 'quantity']
  duplicate: DuplicateMatch | null;
  action: DuplicateAction;
  errors: string[];
  warnings: string[];
  isManual?: boolean;
}

export interface ColumnMapping {
  name: string;
  sku: string;
  category: string;
  unit: string;
  description: string;
  quantity: string;
  purchase_price: string;
  selling_price: string;
  minimum_stock: string;
}

export interface ImportResultSummary {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  mode: ImportMode;
  purchaseNumber?: string;
  errors: string[];
}
