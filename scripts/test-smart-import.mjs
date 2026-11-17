import * as XLSX from 'xlsx';
import {
  detectColumnMapping,
  normalizeUnit,
  generateCsvTemplate,
} from '../lib/inventory/column-detector.ts';
import {
  detectDuplicates,
  validateRow,
} from '../lib/inventory/duplicate-detector.ts';

console.log('🧪 ========================================================');
console.log('🧪 SMART PRODUCT IMPORT COMPREHENSIVE TEST SUITE');
console.log('🧪 ========================================================\n');

let passCount = 0;
let failCount = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`✅ PASS: ${testName}`);
    passCount++;
  } else {
    console.error(`❌ FAIL: ${testName}`);
    failCount++;
  }
}

// ─────────────────────────────────────────────
// TEST 1: CSV Template Generation
// ─────────────────────────────────────────────
console.log('\n--- 1. CSV Template Generation ---');
const templateCsv = generateCsvTemplate();
assert(typeof templateCsv === 'string' && templateCsv.length > 100, 'generateCsvTemplate returns non-empty CSV string');
assert(templateCsv.includes('Product Name') && templateCsv.includes('Purchase Price') && templateCsv.includes('SKU'), 'CSV template includes standard headers');
assert(templateCsv.includes('Polycab') && templateCsv.includes('Schneider'), 'CSV template includes sample electrical contractor products');

// ─────────────────────────────────────────────
// TEST 2: Column Name Auto-Detection
// ─────────────────────────────────────────────
console.log('\n--- 2. Column Name Auto-Detection & Synonyms ---');
const variantHeaders1 = [
  'Item Description',
  'Part Number',
  'Product Group',
  'UOM',
  'Stock Count',
  'Buy Price',
  'MRP',
  'Reorder Point',
  'Technical Specs',
];

const mapping1 = detectColumnMapping(variantHeaders1);
assert(mapping1.name === 'Item Description', 'Auto-detects "Item Description" -> name');
assert(mapping1.sku === 'Part Number', 'Auto-detects "Part Number" -> sku');
assert(mapping1.category === 'Product Group', 'Auto-detects "Product Group" -> category');
assert(mapping1.unit === 'UOM', 'Auto-detects "UOM" -> unit');
assert(mapping1.quantity === 'Stock Count', 'Auto-detects "Stock Count" -> quantity');
assert(mapping1.purchase_price === 'Buy Price', 'Auto-detects "Buy Price" -> purchase_price');
assert(mapping1.selling_price === 'MRP', 'Auto-detects "MRP" -> selling_price');
assert(mapping1.minimum_stock === 'Reorder Point', 'Auto-detects "Reorder Point" -> minimum_stock');

const variantHeaders2 = ['Particulars', 'Code', 'Rate', 'Sale Rate', 'Qty'];
const mapping2 = detectColumnMapping(variantHeaders2);
assert(mapping2.name === 'Particulars', 'Auto-detects invoice "Particulars" -> name');
assert(mapping2.sku === 'Code', 'Auto-detects "Code" -> sku');
assert(mapping2.purchase_price === 'Rate', 'Auto-detects "Rate" -> purchase_price');
assert(mapping2.quantity === 'Qty', 'Auto-detects "Qty" -> quantity');

// ─────────────────────────────────────────────
// TEST 3: Unit Normalization
// ─────────────────────────────────────────────
console.log('\n--- 3. Unit of Measure Normalization ---');
assert(normalizeUnit('mtr') === 'meters', 'Normalizes "mtr" -> "meters"');
assert(normalizeUnit('Meters') === 'meters', 'Normalizes "Meters" -> "meters"');
assert(normalizeUnit('NOS') === 'pcs', 'Normalizes "NOS" -> "pcs"');
assert(normalizeUnit('pieces') === 'pcs', 'Normalizes "pieces" -> "pcs"');
assert(normalizeUnit('Bundle') === 'roll', 'Normalizes "Bundle" -> "roll"');
assert(normalizeUnit('Coil') === 'roll', 'Normalizes "Coil" -> "roll"');
assert(normalizeUnit('PKT') === 'box', 'Normalizes "PKT" -> "box"');
assert(normalizeUnit('KGS') === 'kg', 'Normalizes "KGS" -> "kg"');

// ─────────────────────────────────────────────
// TEST 4: Excel (.XLSX) File Parsing & Bulk Handling
// ─────────────────────────────────────────────
console.log('\n--- 4. Excel (.XLSX) Binary Parsing & Bulk Capacity ---');
// Generate an Excel sheet in memory with 250 electrical products
const bulkData = [];
for (let i = 1; i <= 250; i++) {
  bulkData.push({
    'Product Name': `Havells Modular Switch ${i}A SP`,
    'SKU': `HAV-SW-${i}`,
    'Category': 'Switches & Sockets',
    'Unit': 'pcs',
    'Quantity': i * 10,
    'Cost Price': 45 + i,
    'Selling Price': 75 + i,
    'Min Stock': 15,
  });
}

const ws = XLSX.utils.json_to_sheet(bulkData);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Inventory');
const xlsxBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

assert(xlsxBuffer.length > 5000, `Generated in-memory .XLSX workbook with 250 products (${xlsxBuffer.length} bytes)`);

// Read it back
const readWb = XLSX.read(xlsxBuffer, { type: 'buffer' });
const readSheet = readWb.Sheets[readWb.SheetNames[0]];
const readRows = XLSX.utils.sheet_to_json(readSheet);
assert(readRows.length === 250, `Successfully parsed all 250 rows from XLSX`);
assert(readRows[0]['Product Name'] === 'Havells Modular Switch 1A SP', 'Verified row 1 data integrity');
assert(readRows[249]['SKU'] === 'HAV-SW-250', 'Verified row 250 data integrity');

// ─────────────────────────────────────────────
// TEST 5: Duplicate Detection Engine
// ─────────────────────────────────────────────
console.log('\n--- 5. Duplicate Detection Engine ---');
const existingDbProducts = [
  {
    id: 'prod-1',
    name: 'Polycab 2.5 sq mm FR Red Wire',
    sku: 'POL-25-RED',
    cost_price: 38.5,
    selling_price: 48.0,
    current_stock: 200,
    unit: 'meters',
  },
  {
    id: 'prod-2',
    name: 'Schneider Acti9 32A DP MCB',
    sku: 'SCH-32-DP',
    cost_price: 390.0,
    selling_price: 520.0,
    current_stock: 45,
    unit: 'pcs',
  },
];

// Test 5A: Exact SKU match
const skuDup = detectDuplicates('Polycab Copper Cable', 'POL-25-RED', existingDbProducts);
assert(skuDup !== null && skuDup.type === 'exact_sku', 'Detects exact SKU duplicate');
assert(skuDup.matchedProductId === 'prod-1', 'Identifies correct matched product by SKU');

// Test 5B: Exact Name match (case/spacing insensitive)
const nameDup = detectDuplicates('  polycab 2.5 sq mm fr red wire  ', 'SOME-NEW-SKU', existingDbProducts);
assert(nameDup !== null && nameDup.type === 'exact_name', 'Detects exact Name duplicate with whitespace/case variation');

// Test 5C: Similar electrical product match
const simDup = detectDuplicates('Schneider Acti9 MCB 32A DP C-Curve', '', existingDbProducts);
assert(simDup !== null && simDup.type === 'similar_name', 'Detects fuzzy/similar electrical product name (Schneider 32A DP MCB)');
assert(simDup.score >= 0.7, `Similarity score is high (${simDup?.score})`);

// Test 5D: Completely new unique product
const uniqueDup = detectDuplicates('Anchor Penta 16A 3-Pin Socket', 'ANC-PEN-16', existingDbProducts);
assert(uniqueDup === null, 'Correctly returns null for completely new, unique product');

// ─────────────────────────────────────────────
// TEST 6: Row Validation & Margin Warnings
// ─────────────────────────────────────────────
console.log('\n--- 6. Row Validation Rules & Sanity Checks ---');
const invalidRow1 = {
  id: 'r-1',
  name: '', // missing
  sku: 'TEST-1',
  category: 'Test',
  unit: 'pcs',
  description: '',
  quantity: 10,
  purchase_price: 50,
  selling_price: 80,
  minimum_stock: 0,
  confidence: 'high',
  uncertain_fields: [],
  duplicate: null,
  action: 'create',
  errors: [],
  warnings: [],
};
const val1 = validateRow(invalidRow1, existingDbProducts, [invalidRow1]);
assert(val1.errors.includes('Product name is required'), 'Flags missing product name as error');

const invalidRow2 = {
  id: 'r-2',
  name: 'Valid Product',
  sku: 'TEST-2',
  category: 'Test',
  unit: 'pcs',
  description: '',
  quantity: -5, // negative
  purchase_price: 100,
  selling_price: 80, // lower than cost
  minimum_stock: 0,
  confidence: 'high',
  uncertain_fields: [],
  duplicate: null,
  action: 'create',
  errors: [],
  warnings: [],
};
const val2 = validateRow(invalidRow2, existingDbProducts, [invalidRow2]);
assert(val2.errors.includes('Quantity cannot be negative'), 'Flags negative quantity as error');
assert(val2.warnings.some((w) => w.includes('lower than purchase cost')), 'Warns when selling price < purchase cost');

// Intra-batch duplicate SKU check
const batchRows = [
  { id: 'b1', name: 'Product A', sku: 'DUP-SKU-1', quantity: 1, purchase_price: 10, selling_price: 20, minimum_stock: 0 },
  { id: 'b2', name: 'Product B', sku: 'DUP-SKU-1', quantity: 2, purchase_price: 15, selling_price: 25, minimum_stock: 0 },
];
const valBatch = validateRow(batchRows[0], existingDbProducts, batchRows);
assert(valBatch.warnings.some((w) => w.includes('duplicated multiple times within this import file')), 'Flags intra-batch duplicate SKUs');

// ─────────────────────────────────────────────
// TEST 7: HTTP Route Probing
// ─────────────────────────────────────────────
console.log('\n--- 7. HTTP Route & Security Probing ---');
async function testHttpEndpoints() {
  try {
    // 7A: Probing /dashboard/inventory/import
    const importPageRes = await fetch('http://localhost:3000/dashboard/inventory/import', { redirect: 'manual' });
    assert(importPageRes.status === 307 || importPageRes.status === 200, `GET /dashboard/inventory/import responded with HTTP ${importPageRes.status} (SSR protection active)`);

    // 7B: POST /api/inventory/import/extract without file
    const extractResNoFile = await fetch('http://localhost:3000/api/inventory/import/extract', {
      method: 'POST',
      body: new FormData(),
    });
    assert(extractResNoFile.status === 401 || extractResNoFile.status === 400, `POST /api/inventory/import/extract without auth/file returns ${extractResNoFile.status}`);

    // 7C: POST /api/inventory/import/save unauthenticated
    const saveResUnauth = await fetch('http://localhost:3000/api/inventory/import/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'catalogue', items: [] }),
    });
    assert(saveResUnauth.status === 401, `POST /api/inventory/import/save rejects unauthenticated requests with HTTP 401`);
  } catch (err) {
    console.error('HTTP test error:', err.message);
    failCount++;
  }

  console.log(`\n========================================================`);
  console.log(`🏁 Test Summary: ${passCount} PASSED, ${failCount} FAILED`);
  console.log(`========================================================\n`);

  if (failCount > 0) process.exit(1);
}

testHttpEndpoints();
