import type { ColumnMapping } from '@/lib/types/import';

const SYNONYMS: Record<keyof ColumnMapping, string[]> = {
  name: [
    'product name',
    'product_name',
    'product',
    'item name',
    'item_name',
    'item',
    'item description',
    'description',
    'material name',
    'material',
    'title',
    'particulars',
    'goods',
  ],
  sku: [
    'sku',
    'item code',
    'item_code',
    'product code',
    'product_code',
    'code',
    'part number',
    'part_number',
    'part no',
    'part_no',
    'catalog no',
    'catalogue no',
    'cat no',
    'model',
    'hsn',
  ],
  category: [
    'category',
    'category name',
    'category_name',
    'group',
    'product group',
    'item group',
    'class',
    'type',
    'family',
  ],
  unit: [
    'unit',
    'uom',
    'unit of measure',
    'unit_of_measure',
    'unit of measurement',
    'measurement',
    'pack unit',
    'base unit',
  ],
  description: [
    'description',
    'product description',
    'specification',
    'specifications',
    'specs',
    'technical specs',
    'details',
    'notes',
    'remark',
    'remarks',
  ],
  quantity: [
    'quantity',
    'qty',
    'stock',
    'opening stock',
    'current stock',
    'count',
    'units',
    'pcs',
    'in stock',
    'received qty',
    'billed qty',
  ],
  purchase_price: [
    'purchase price',
    'purchase_price',
    'cost',
    'cost price',
    'cost_price',
    'unit cost',
    'unit_cost',
    'buy price',
    'rate',
    'purchase rate',
    'unit rate',
    'basic rate',
    'price per unit',
  ],
  selling_price: [
    'selling price',
    'selling_price',
    'sale price',
    'sale_price',
    'mrp',
    'retail price',
    'price',
    'list price',
    'customer price',
    'sale rate',
  ],
  minimum_stock: [
    'minimum stock',
    'minimum_stock',
    'min stock',
    'min_stock',
    'reorder level',
    'reorder point',
    'low stock threshold',
    'alert level',
    'threshold',
    'safety stock',
  ],
};

export function detectColumnMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {
    name: '',
    sku: '',
    category: '',
    unit: '',
    description: '',
    quantity: '',
    purchase_price: '',
    selling_price: '',
    minimum_stock: '',
  };

  const normalizedHeaders = headers.map((h) => ({
    raw: h,
    clean: h.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim().replace(/\s+/g, ' '),
  }));

  const assignedHeaders = new Set<string>();

  // Helper: find best matching header for a field
  for (const field of Object.keys(SYNONYMS) as (keyof ColumnMapping)[]) {
    const fieldSynonyms = SYNONYMS[field];

    // 1. Exact match with clean synonyms
    for (const item of normalizedHeaders) {
      if (assignedHeaders.has(item.raw)) continue;
      if (fieldSynonyms.includes(item.clean)) {
        mapping[field] = item.raw;
        assignedHeaders.add(item.raw);
        break;
      }
    }

    // 2. Substring match if still unassigned
    if (!mapping[field]) {
      for (const item of normalizedHeaders) {
        if (assignedHeaders.has(item.raw)) continue;
        const matched = fieldSynonyms.some(
          (syn) => item.clean === syn || item.clean.startsWith(syn + ' ') || item.clean.endsWith(' ' + syn)
        );
        if (matched) {
          mapping[field] = item.raw;
          assignedHeaders.add(item.raw);
          break;
        }
      }
    }
  }

  return mapping;
}

export function normalizeUnit(rawUnit: string | null | undefined): string {
  if (!rawUnit) return 'pcs';
  const u = rawUnit.toLowerCase().trim().replace(/[^a-z]/g, '');
  if (['m', 'mtr', 'mtrs', 'meter', 'meters', 'metre', 'metres'].includes(u)) return 'meters';
  if (['nos', 'pc', 'pcs', 'piece', 'pieces', 'unit', 'units', 'each', 'ea'].includes(u)) return 'pcs';
  if (['box', 'boxes', 'pkt', 'pkts', 'packet', 'packets', 'pack'].includes(u)) return 'box';
  if (['roll', 'rolls', 'coil', 'coils', 'bundle', 'bundles'].includes(u)) return 'roll';
  if (['kg', 'kgs', 'kilo', 'kilogram', 'kilograms'].includes(u)) return 'kg';
  if (['set', 'sets', 'pair', 'kit'].includes(u)) return 'set';
  return rawUnit.trim() || 'pcs';
}

export function generateCsvTemplate(): string {
  const headers = [
    'Product Name',
    'SKU',
    'Category',
    'Unit',
    'Quantity',
    'Purchase Price',
    'Selling Price',
    'Minimum Stock',
    'Description',
  ];

  const sampleRows = [
    [
      'Polycab 2.5 sq mm FR Copper Wire (Red)',
      'POL-25-RED',
      'Wires & Cables',
      'meters',
      '500',
      '38.50',
      '48.00',
      '100',
      'Single core flame retardant PVC insulated copper wire (90m coil)',
    ],
    [
      'Schneider Acti9 32A Double Pole MCB C-Curve',
      'SCH-MCB-32-DP',
      'Switchgear',
      'pcs',
      '40',
      '385.00',
      '510.00',
      '10',
      '10kA breaking capacity double pole miniature circuit breaker',
    ],
    [
      'Havells Coral 20A Heavy Duty Switch',
      'HAV-COR-20S',
      'Switches & Sockets',
      'pcs',
      '120',
      '82.00',
      '125.00',
      '25',
      'Modular single pole switch for geysers and AC points',
    ],
    [
      'Precision 25mm Heavy Duty PVC Conduit Pipe',
      'PRE-PVC-25-HD',
      'Conduits & Fittings',
      'meters',
      '300',
      '28.00',
      '38.00',
      '50',
      '3-meter length rigid heavy gauge electrical conduit pipe',
    ],
    [
      'Philips 18W Slim Square LED Panel Light (Cool White)',
      'PHI-LED-18-SQ',
      'Lighting',
      'pcs',
      '30',
      '295.00',
      '420.00',
      '6',
      '6500K recessed ceiling downlight with inbuilt driver',
    ],
    [
      'Legrand 8-Way SPN Distribution Board (Double Door)',
      'LEG-DB-8W-DD',
      'Distribution Boards',
      'pcs',
      '12',
      '1150.00',
      '1580.00',
      '3',
      'IP43 sheet steel enclosure with top & bottom gland plates',
    ],
  ];

  const escapeCsv = (val: string) => {
    if (val.includes(',') || val.includes('"') || val.includes('\n')) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  };

  return [
    headers.map(escapeCsv).join(','),
    ...sampleRows.map((r) => r.map(escapeCsv).join(',')),
  ].join('\r\n');
}
