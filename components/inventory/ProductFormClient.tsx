"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Package, Sparkles, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Product, Category } from "@/lib/types/inventory";

interface Props {
  mode: "create" | "edit";
  initialProduct?: Product;
  categories: Category[];
  businessId?: string;
}

const UNIT_PICKS = ["pcs", "meters", "kg", "box", "roll", "set"];

export default function ProductFormClient({ mode, initialProduct, categories }: Props) {
  const router = useRouter();
  const supabase = createClient();

  const [name, setName] = useState(initialProduct?.name ?? "");
  const [sku, setSku] = useState(initialProduct?.sku ?? "");
  const [categoryId, setCategoryId] = useState(initialProduct?.category_id ?? "");
  const [unit, setUnit] = useState(initialProduct?.unit ?? "pcs");
  const [description, setDescription] = useState(initialProduct?.description ?? "");
  const [sellingPrice, setSellingPrice] = useState(String(initialProduct?.selling_price ?? ""));
  const [minimumStock, setMinimumStock] = useState(String(initialProduct?.minimum_stock ?? "0"));
  const [isActive, setIsActive] = useState(initialProduct?.is_active ?? true);

  // Optional opening stock for initial inventory migration (create mode only)
  const [hasOpeningStock, setHasOpeningStock] = useState(false);
  const [openingStock, setOpeningStock] = useState("");
  const [openingCost, setOpeningCost] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Product name is required.");
      return;
    }

    setLoading(true);
    setError("");

    const parsedOpeningStock = hasOpeningStock ? parseFloat(openingStock) || 0 : 0;
    const parsedOpeningCost = hasOpeningStock ? parseFloat(openingCost) || 0 : 0;

    const params: Record<string, unknown> = {
      p_name: name.trim(),
      p_sku: sku.trim() || null,
      p_category_id: categoryId || null,
      p_unit: unit.trim() || "pcs",
      p_description: description.trim() || null,
      p_selling_price: parseFloat(sellingPrice) || 0,
      p_minimum_stock: parseFloat(minimumStock) || 0,
      p_is_active: isActive,
    };

    if (mode === "create") {
      params.p_opening_stock = parsedOpeningStock;
      params.p_opening_cost = parsedOpeningCost;
      params.p_cost_price = parsedOpeningCost;
    } else if (mode === "edit" && initialProduct) {
      params.p_id = initialProduct.id;
      params.p_cost_price = initialProduct.cost_price;
    }

    const { error: rpcError } = await supabase.rpc("upsert_product", params);
    setLoading(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    router.push("/dashboard/inventory");
    router.refresh();
  }

  return (
    <div>
      <button
        className="subtle-button"
        style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 20 }}
        onClick={() => router.back()}
      >
        <ArrowLeft size={14} /> Back
      </button>

      <div className="inv-header">
        <div>
          <p className="eyebrow">{mode === "create" ? "PRODUCT CATALOGUE" : "EDIT CATALOGUE"}</p>
          <h1>{mode === "create" ? "Add Product" : initialProduct?.name ?? "Edit Product"}</h1>
          <p className="muted">
            {mode === "create"
              ? "Define your electrical catalogue item with specifications and selling rates."
              : "Update product catalogue details. Stock balances are managed via Purchases & Material Issues."}
          </p>
        </div>
      </div>

      <div className="panel" style={{ maxWidth: 720 }}>
        <form className="form-stack" onSubmit={handleSubmit}>
          {/* Basic info */}
          <div className="form-row">
            <label>
              Product name <span style={{ color: "#c0392b" }}>*</span>
              <div className="input-wrap" style={{ marginTop: 7 }}>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. 1.5mm² 3-Core Copper Armoured Cable"
                  required
                />
              </div>
            </label>
            <label>
              SKU / Item Code <span className="muted" style={{ fontWeight: 400 }}>(optional)</span>
              <div className="input-wrap" style={{ marginTop: 7 }}>
                <input
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  placeholder="e.g. CAB-ARM-1.5-3C"
                />
              </div>
            </label>
          </div>

          <div className="form-row">
            <label>
              Category
              <div style={{ marginTop: 7 }}>
                <select
                  className="select-input"
                  style={{ width: "100%", height: 43 }}
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                >
                  <option value="">No category (Unassigned)</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </label>

            <label>
              Unit of measurement
              <div className="input-wrap" style={{ marginTop: 7, flexWrap: "wrap", height: "auto", paddingTop: 8, paddingBottom: 8 }}>
                <input
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="pcs"
                  style={{ flex: 1, minWidth: 60 }}
                  required
                />
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {UNIT_PICKS.map((u) => (
                    <button
                      key={u}
                      type="button"
                      className="subtle-button"
                      style={{
                        fontSize: 10,
                        padding: "3px 7px",
                        background: unit === u ? "#edf3ff" : undefined,
                        color: unit === u ? "#246bfd" : undefined,
                      }}
                      onClick={() => setUnit(u)}
                    >
                      {u}
                    </button>
                  ))}
                </div>
              </div>
            </label>
          </div>

          <label>
            Description / Specifications
            <div style={{ marginTop: 7 }}>
              <textarea
                className="input-wrap"
                style={{
                  height: "auto",
                  alignItems: "flex-start",
                  paddingTop: 10,
                  paddingBottom: 10,
                  resize: "vertical",
                  width: "100%",
                  fontFamily: "inherit",
                }}
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Technical specifications, brand standard (e.g. Polycab/Havells, 1100V IS:694)..."
              />
            </div>
          </label>

          {/* Pricing & Low stock settings */}
          <div className="form-section">
            <div className="form-section-title">SELLING &amp; REORDER SETTINGS</div>
            <div className="form-row" style={{ marginTop: 14 }}>
              <label>
                Default selling price (₹)
                <div className="input-wrap" style={{ marginTop: 7 }}>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={sellingPrice}
                    onChange={(e) => setSellingPrice(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <span className="muted" style={{ fontSize: 11, marginTop: 4, display: "block" }}>
                  Standard rate suggested when generating customer invoices.
                </span>
              </label>

              <label>
                Minimum stock level ({unit || "units"})
                <div className="input-wrap" style={{ marginTop: 7 }}>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={minimumStock}
                    onChange={(e) => setMinimumStock(e.target.value)}
                    placeholder="0"
                  />
                </div>
                <span className="muted" style={{ fontSize: 11, marginTop: 4, display: "block" }}>
                  Alerts will trigger whenever available stock drops to or below this level.
                </span>
              </label>
            </div>
          </div>

          {/* Optional Opening Stock Feature (Create Mode Only) */}
          {mode === "create" && (
            <div className="form-section" style={{ background: "#fafbfd", padding: "16px", borderRadius: "10px", border: "1px solid var(--line)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontWeight: 700, fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={hasOpeningStock}
                    onChange={(e) => setHasOpeningStock(e.target.checked)}
                    style={{ width: 16, height: 16 }}
                  />
                  <Package size={16} style={{ color: "#246bfd" }} />
                  Record existing opening stock (Migration)
                </label>
                <span className="badge blue" style={{ fontSize: 9 }}>Optional</span>
              </div>

              {hasOpeningStock && (
                <div style={{ marginTop: 16 }}>
                  <p className="muted" style={{ fontSize: 12, marginBottom: 14 }}>
                    Enter current physical quantities on hand to migrate your existing inventory. An initial opening ledger entry will be created.
                  </p>
                  <div className="form-row">
                    <label>
                      Opening stock quantity ({unit || "pcs"}) <span style={{ color: "#c0392b" }}>*</span>
                      <div className="input-wrap" style={{ marginTop: 7, background: "#fff" }}>
                        <input
                          type="number"
                          min="0.001"
                          step="any"
                          required={hasOpeningStock}
                          value={openingStock}
                          onChange={(e) => setOpeningStock(e.target.value)}
                          placeholder="e.g. 50"
                        />
                      </div>
                    </label>

                    <label>
                      Opening purchase cost per unit (₹) <span style={{ color: "#c0392b" }}>*</span>
                      <div className="input-wrap" style={{ marginTop: 7, background: "#fff" }}>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          required={hasOpeningStock}
                          value={openingCost}
                          onChange={(e) => setOpeningCost(e.target.value)}
                          placeholder="e.g. 45.00"
                        />
                      </div>
                    </label>
                  </div>

                  {parseFloat(openingStock) > 0 && parseFloat(openingCost) > 0 && (
                    <div
                      style={{
                        marginTop: 12,
                        padding: "10px 14px",
                        background: "#edf3ff",
                        borderRadius: "8px",
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontSize: 12,
                        color: "#246bfd",
                        fontWeight: 600,
                      }}
                    >
                      <Sparkles size={15} />
                      Initial inventory valuation: ₹
                      {(parseFloat(openingStock) * parseFloat(openingCost)).toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Edit mode: Informational Stock Callout */}
          {mode === "edit" && initialProduct && (
            <div className="form-section">
              <div
                style={{
                  padding: "12px 16px",
                  background: "#f8fafd",
                  border: "1px solid var(--line)",
                  borderRadius: "8px",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                }}
              >
                <AlertCircle size={18} style={{ color: "#246bfd", marginTop: 2, flexShrink: 0 }} />
                <div style={{ fontSize: 12, lineHeight: 1.5 }}>
                  <strong>Inventory Balances:</strong> Current stock is{" "}
                  <strong>{initialProduct.current_stock} {initialProduct.unit}</strong> with a weighted
                  average valuation cost of{" "}
                  <strong>₹{Number(initialProduct.cost_price).toFixed(2)}</strong>. To record new supplier
                  receipts, please use the{" "}
                  <button
                    type="button"
                    onClick={() => router.push("/dashboard/inventory/purchases/new")}
                    style={{
                      border: 0,
                      background: "transparent",
                      color: "#246bfd",
                      textDecoration: "underline",
                      cursor: "pointer",
                      padding: 0,
                      fontWeight: 700,
                    }}
                  >
                    Purchase Stock
                  </button>{" "}
                  workflow.
                </div>
              </div>
            </div>
          )}

          {/* Active toggle — edit only */}
          {mode === "edit" && (
            <div className="form-section">
              <div className="form-section-title">STATUS</div>
              <label style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  style={{ width: 16, height: 16 }}
                />
                <span style={{ fontSize: 13, fontWeight: 600 }}>Active product in catalogue</span>
                <span className="muted" style={{ fontSize: 12 }}>(Uncheck to archive and prevent future purchase/issue)</span>
              </label>
            </div>
          )}

          {error && <div className="notice error">{error}</div>}

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", paddingTop: 8 }}>
            <button type="button" className="subtle-button" onClick={() => router.back()}>
              Cancel
            </button>
            <button type="submit" className="primary-button" disabled={loading}>
              {loading ? <Loader2 size={15} className="spin" /> : null}
              {mode === "create" ? "Save Product to Catalogue" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
