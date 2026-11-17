import type { DuplicateMatch, ExtractedProductRow } from '@/lib/types/import';

export interface ExistingProductRef {
  id: string;
  name: string;
  sku: string | null;
  cost_price: number;
  selling_price: number;
  current_stock: number;
  unit: string;
}

function cleanString(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

function getWordTokens(str: string): Set<string> {
  const words = cleanString(str).split(' ').filter((w) => w.length > 1);
  return new Set(words);
}

function calculateTokenSimilarity(a: string, b: string): number {
  const tokensA = getWordTokens(a);
  const tokensB = getWordTokens(b);
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++;
  }

  const union = tokensA.size + tokensB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function detectDuplicates(
  rowName: string,
  rowSku: string,
  existingProducts: ExistingProductRef[]
): DuplicateMatch | null {
  const cleanName = cleanString(rowName);
  const cleanSku = rowSku.trim().toLowerCase();

  // 1. Exact SKU match (highest confidence)
  if (cleanSku) {
    const skuMatch = existingProducts.find(
      (p) => p.sku && p.sku.trim().toLowerCase() === cleanSku
    );
    if (skuMatch) {
      return {
        type: 'exact_sku',
        matchedProductId: skuMatch.id,
        matchedProductName: skuMatch.name,
        matchedSku: skuMatch.sku,
        existingCost: skuMatch.cost_price,
        existingPrice: skuMatch.selling_price,
        existingStock: skuMatch.current_stock,
        score: 1.0,
        message: `Existing product has identical SKU "${skuMatch.sku}" ("${skuMatch.name}")`,
      };
    }
  }

  // 2. Exact Name match (normalized)
  if (cleanName) {
    const nameMatch = existingProducts.find(
      (p) => cleanString(p.name) === cleanName
    );
    if (nameMatch) {
      return {
        type: 'exact_name',
        matchedProductId: nameMatch.id,
        matchedProductName: nameMatch.name,
        matchedSku: nameMatch.sku,
        existingCost: nameMatch.cost_price,
        existingPrice: nameMatch.selling_price,
        existingStock: nameMatch.current_stock,
        score: 0.95,
        message: `Matches existing catalogue product name "${nameMatch.name}"`,
      };
    }

    // 3. High Fuzzy / Similarity match (token similarity >= 0.70)
    let bestMatch: ExistingProductRef | null = null;
    let highestScore = 0;

    for (const p of existingProducts) {
      const score = calculateTokenSimilarity(rowName, p.name);
      if (score >= 0.7 && score > highestScore) {
        highestScore = score;
        bestMatch = p;
      }
    }

    if (bestMatch) {
      return {
        type: 'similar_name',
        matchedProductId: bestMatch.id,
        matchedProductName: bestMatch.name,
        matchedSku: bestMatch.sku,
        existingCost: bestMatch.cost_price,
        existingPrice: bestMatch.selling_price,
        existingStock: bestMatch.current_stock,
        score: Number(highestScore.toFixed(2)),
        message: `Similar to existing "${bestMatch.name}" (${Math.round(highestScore * 100)}% match)`,
      };
    }
  }

  return null;
}

export function validateRow(
  row: ExtractedProductRow,
  existingProducts: ExistingProductRef[],
  allBatchRows: ExtractedProductRow[]
): { errors: string[]; warnings: string[]; duplicate: DuplicateMatch | null } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required field validation
  if (!row.name || !row.name.trim()) {
    errors.push('Product name is required');
  }

  if (row.quantity < 0) {
    errors.push('Quantity cannot be negative');
  }

  if (row.purchase_price < 0) {
    errors.push('Purchase price cannot be negative');
  }

  if (row.selling_price < 0) {
    errors.push('Selling price cannot be negative');
  }

  if (row.minimum_stock < 0) {
    errors.push('Minimum stock cannot be negative');
  }

  // Margin sanity check
  if (row.purchase_price > 0 && row.selling_price > 0 && row.selling_price < row.purchase_price) {
    warnings.push(
      `Selling price (${row.selling_price}) is lower than purchase cost (${row.purchase_price})`
    );
  }

  // Check duplicate in existing database
  const duplicate = detectDuplicates(row.name, row.sku, existingProducts);
  if (duplicate) {
    warnings.push(duplicate.message);
  }

  // Check intra-batch duplicate SKUs
  if (row.sku && row.sku.trim()) {
    const batchMatches = allBatchRows.filter(
      (r) => r.id !== row.id && r.sku && r.sku.trim().toLowerCase() === row.sku.trim().toLowerCase()
    );
    if (batchMatches.length > 0) {
      warnings.push(`SKU "${row.sku}" is duplicated multiple times within this import file`);
    }
  }

  return { errors, warnings, duplicate };
}
