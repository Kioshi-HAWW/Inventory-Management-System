import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { ExtractedProductRow, ImportMode, ImportResultSummary } from '@/lib/types/import';

interface ImportSavePayload {
  mode: ImportMode;
  items: ExtractedProductRow[];
  supplierId?: string | null;
  purchaseNumber?: string | null;
  purchaseDate?: string | null;
  purchaseNotes?: string | null;
  paymentStatus?: string | null;
}

const CONCURRENCY_CHUNK_SIZE = 6;

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    // 1. Auth check
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized. Please log in.' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('business_id, role')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile?.business_id) {
      return NextResponse.json(
        { error: 'Business account setup required.' },
        { status: 403 }
      );
    }

    if (profile.role !== 'owner' && profile.role !== 'manager') {
      return NextResponse.json(
        { error: 'Permission denied. Only managers and owners can import inventory.' },
        { status: 403 }
      );
    }

    const businessId = profile.business_id;

    // 2. Parse & Validate Payload
    const body: ImportSavePayload = await req.json();
    const {
      mode = 'catalogue',
      items = [],
      supplierId = null,
      purchaseNumber,
      purchaseDate,
      purchaseNotes,
      paymentStatus = 'paid',
    } = body;

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'No items provided for import.' }, { status: 400 });
    }

    // Filter out rows marked as 'skip'
    const processItems = items.filter((it) => it.action !== 'skip');
    const skippedCount = items.length - processItems.length;

    if (processItems.length === 0) {
      return NextResponse.json({
        total: items.length,
        created: 0,
        updated: 0,
        skipped: skippedCount,
        failed: 0,
        mode,
        errors: [],
      } satisfies ImportResultSummary);
    }

    // 3. Fast Parallel Category Resolution Upfront
    const { data: existingCategories } = await supabase
      .from('categories')
      .select('id, name')
      .eq('business_id', businessId);

    const categoryMap = new Map<string, string>();
    for (const c of existingCategories || []) {
      categoryMap.set(c.name.toLowerCase().trim(), c.id);
    }

    // Find all distinct categories needed by the import batch
    const uniqueCategoryNames = Array.from(
      new Set(
        processItems
          .map((it) => it.category?.trim())
          .filter((c): c is string => Boolean(c && c.length > 0))
      )
    );

    // Resolve missing categories concurrently
    const missingCategories = uniqueCategoryNames.filter(
      (c) => !categoryMap.has(c.toLowerCase())
    );

    if (missingCategories.length > 0) {
      await Promise.all(
        missingCategories.map(async (catName) => {
          try {
            const { data: newCatId, error: catError } = await supabase.rpc('upsert_category', {
              p_name: catName,
              p_description: 'Auto-created via Smart Import',
            });
            if (!catError && newCatId) {
              categoryMap.set(catName.toLowerCase(), newCatId as string);
            }
          } catch {
            // Ignore individual category error, row can still be created without category
          }
        })
      );
    }

    let createdCount = 0;
    let updatedCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    // Array to hold items for purchase mode
    const purchaseLineItems: Array<{ product_id: string; quantity: number; unit_cost: number }> = [];

    // 4. Process Rows in Parallel Chunks for 5x-10x Speedup
    for (let i = 0; i < processItems.length; i += CONCURRENCY_CHUNK_SIZE) {
      const chunk = processItems.slice(i, i + CONCURRENCY_CHUNK_SIZE);

      await Promise.all(
        chunk.map(async (item) => {
          try {
            const catId = item.category ? categoryMap.get(item.category.trim().toLowerCase()) || null : null;
            const isUpdate = item.action === 'update' && item.duplicate?.matchedProductId;

            if (mode === 'catalogue') {
              // MODE 1: Product Catalogue Only
              const params: Record<string, unknown> = {
                p_name: item.name.trim(),
                p_sku: item.sku.trim() || null,
                p_category_id: catId,
                p_unit: item.unit.trim() || 'pcs',
                p_description: item.description.trim() || null,
                p_cost_price: Math.max(0, item.purchase_price || 0),
                p_selling_price: Math.max(0, item.selling_price || 0),
                p_minimum_stock: Math.max(0, item.minimum_stock || 0),
                p_is_active: true,
                p_opening_stock: 0,
                p_opening_cost: 0,
              };

              if (isUpdate) {
                params.p_id = item.duplicate!.matchedProductId;
                const { error: updErr } = await supabase.rpc('upsert_product', params);
                if (updErr) throw updErr;
                updatedCount++;
              } else {
                const { error: insErr } = await supabase.rpc('upsert_product', params);
                if (insErr) throw insErr;
                createdCount++;
              }
            } else if (mode === 'opening_stock') {
              // MODE 2: Opening Stock Import
              const qty = Math.max(0, item.quantity || 0);
              const cost = Math.max(0, item.purchase_price || 0);

              if (isUpdate) {
                const prodId = item.duplicate!.matchedProductId;
                const { error: updErr } = await supabase.rpc('upsert_product', {
                  p_id: prodId,
                  p_name: item.name.trim(),
                  p_sku: item.sku.trim() || null,
                  p_category_id: catId,
                  p_unit: item.unit.trim() || 'pcs',
                  p_description: item.description.trim() || null,
                  p_cost_price: cost || item.duplicate!.existingCost,
                  p_selling_price: Math.max(0, item.selling_price || item.duplicate!.existingPrice),
                  p_minimum_stock: Math.max(0, item.minimum_stock || 0),
                  p_is_active: true,
                });
                if (updErr) throw updErr;

                if (qty > 0) {
                  const { error: adjErr } = await supabase.rpc('adjust_stock', {
                    p_product_id: prodId,
                    p_direction: 'in',
                    p_quantity: qty,
                    p_notes: 'Initial opening stock balance via Smart Import',
                  });
                  if (adjErr) throw adjErr;
                }
                updatedCount++;
              } else {
                const { error: createErr } = await supabase.rpc('upsert_product', {
                  p_name: item.name.trim(),
                  p_sku: item.sku.trim() || null,
                  p_category_id: catId,
                  p_unit: item.unit.trim() || 'pcs',
                  p_description: item.description.trim() || null,
                  p_cost_price: cost,
                  p_selling_price: Math.max(0, item.selling_price || 0),
                  p_minimum_stock: Math.max(0, item.minimum_stock || 0),
                  p_is_active: true,
                  p_opening_stock: qty,
                  p_opening_cost: cost,
                });
                if (createErr) throw createErr;
                createdCount++;
              }
            } else if (mode === 'purchase') {
              // MODE 3: Actual Purchase Import
              let targetProductId: string;

              if (isUpdate) {
                targetProductId = item.duplicate!.matchedProductId;
                await supabase.rpc('upsert_product', {
                  p_id: targetProductId,
                  p_name: item.name.trim(),
                  p_sku: item.sku.trim() || null,
                  p_category_id: catId,
                  p_unit: item.unit.trim() || 'pcs',
                  p_description: item.description.trim() || null,
                  p_selling_price: Math.max(0, item.selling_price || item.duplicate!.existingPrice),
                  p_minimum_stock: Math.max(0, item.minimum_stock || 0),
                  p_is_active: true,
                });
                updatedCount++;
              } else {
                const { data: newProdId, error: createErr } = await supabase.rpc('upsert_product', {
                  p_name: item.name.trim(),
                  p_sku: item.sku.trim() || null,
                  p_category_id: catId,
                  p_unit: item.unit.trim() || 'pcs',
                  p_description: item.description.trim() || null,
                  p_cost_price: Math.max(0, item.purchase_price || 0),
                  p_selling_price: Math.max(0, item.selling_price || 0),
                  p_minimum_stock: Math.max(0, item.minimum_stock || 0),
                  p_is_active: true,
                  p_opening_stock: 0,
                  p_opening_cost: 0,
                });

                if (createErr || !newProdId) {
                  throw createErr || new Error(`Failed to initialize catalogue entry for ${item.name}`);
                }
                targetProductId = newProdId as string;
                createdCount++;
              }

              const itemQty = Math.max(0.001, item.quantity || 1);
              const itemCost = Math.max(0, item.purchase_price || 0);

              purchaseLineItems.push({
                product_id: targetProductId,
                quantity: itemQty,
                unit_cost: itemCost,
              });
            }
          } catch (rowErr: any) {
            failedCount++;
            errors.push(`Row "${item.name}": ${rowErr.message || 'Processing failed'}`);
          }
        })
      );
    }

    // 5. If Purchase Mode, record atomic purchase invoice transaction
    let actualPoNumber = purchaseNumber;
    if (mode === 'purchase' && purchaseLineItems.length > 0) {
      if (!actualPoNumber || !actualPoNumber.trim()) {
        const rand = Math.floor(1000 + Math.random() * 9000);
        actualPoNumber = `PO-IMP-${new Date().getFullYear()}-${rand}`;
      }

      const pDate = purchaseDate || new Date().toISOString().split('T')[0];

      const { error: purchaseErr } = await supabase.rpc('purchase_stock', {
        p_supplier_id: supplierId || null,
        p_purchase_number: actualPoNumber.trim(),
        p_purchase_date: pDate,
        p_notes: purchaseNotes || `Imported via Smart Import (${purchaseLineItems.length} lines)`,
        p_items: purchaseLineItems,
        p_discount_amount: 0,
        p_tax_amount: 0,
        p_other_charges: 0,
        p_payment_status: paymentStatus || 'paid',
      });

      if (purchaseErr) {
        errors.push(`Failed to record purchase stock batch: ${purchaseErr.message}`);
      }
    }

    const summary: ImportResultSummary = {
      total: items.length,
      created: createdCount,
      updated: updatedCount,
      skipped: skippedCount,
      failed: failedCount,
      mode,
      purchaseNumber: actualPoNumber || undefined,
      errors,
    };

    return NextResponse.json(summary);
  } catch (err: any) {
    console.error('Import save exception:', err);
    return NextResponse.json(
      { error: err.message || 'An unexpected error occurred during import execution.' },
      { status: 500 }
    );
  }
}
