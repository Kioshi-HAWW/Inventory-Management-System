"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import ProductFormClient from "@/components/inventory/ProductFormClient";
import StockLedger from "@/components/inventory/StockLedger";
import PriceHistoryTable from "@/components/inventory/PriceHistoryTable";
import type { Product, Category } from "@/lib/types/inventory";

const money = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n);

type Tab = "edit" | "ledger" | "price";

interface AdjustForm {
  direction: "in" | "out";
  quantity: string;
  notes: string;
}

interface Props {
  product: Product;
  categories: Category[];
  userRole: string;
}

export default function ProductDetailClient({ product, categories, userRole }: Props) {
  const router = useRouter();
  const supabase = createClient();

  const [activeTab, setActiveTab] = useState<Tab>("edit");
  const [showAdjust, setShowAdjust] = useState(false);
  const [adjust, setAdjust] = useState<AdjustForm>({ direction: "in", quantity: "", notes: "" });
  const [adjusting, setAdjusting] = useState(false);
  const [adjustError, setAdjustError] = useState("");
  const [adjustSuccess, setAdjustSuccess] = useState("");

  // stock status
  const isOut = product.current_stock === 0;
  const isLow = !isOut && product.minimum_stock > 0 && product.current_stock <= product.minimum_stock;

  const stockPct = product.minimum_stock > 0
    ? Math.min(100, Math.round((product.current_stock / product.minimum_stock) * 100))
    : 100;

  const barColor = isOut ? "#c0392b" : isLow ? "#c98724" : "#139b72";

  async function handleAdjust(e: React.FormEvent) {
    e.preventDefault();
    const qty = parseInt(adjust.quantity);
    if (!qty || qty <= 0) { setAdjustError("Enter a valid quantity."); return; }
    setAdjusting(true);
    setAdjustError("");
    setAdjustSuccess("");

    const { error } = await supabase.rpc("adjust_stock", {
      p_product_id: product.id,
      p_direction: adjust.direction,
      p_quantity: qty,
      p_notes: adjust.notes.trim() || null,
    });

    setAdjusting(false);
    if (error) { setAdjustError(error.message); return; }
    setAdjustSuccess(`Stock ${adjust.direction === "in" ? "added" : "removed"}: ${qty} ${product.unit}`);
    setAdjust({ direction: "in", quantity: "", notes: "" });
    setTimeout(() => setShowAdjust(false), 1200);
    router.refresh();
  }

  return (
    <div>
      <button
        className="subtle-button"
        style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 20 }}
        onClick={() => router.push("/dashboard/inventory")}
      >
        <ArrowLeft size={14} /> Back to Inventory
      </button>

      {/* Header */}
      <div className="inv-header" style={{ marginBottom: 16 }}>
        <div>
          <p className="eyebrow">PRODUCT</p>
          <h1 style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {product.name}
            {product.sku && <span className="muted" style={{ fontWeight: 400, fontSize: 14 }}>· {product.sku}</span>}
            <span className={`badge ${product.is_active ? "green" : "grey"}`}>
              {product.is_active ? "Active" : "Archived"}
            </span>
          </h1>
        </div>
        <button
          className="primary-button"
          style={{ gap: 7 }}
          onClick={() => { setShowAdjust(v => !v); setAdjustError(""); setAdjustSuccess(""); }}
        >
          {adjust.direction === "in" ? <TrendingUp size={15} /> : <TrendingDown size={15} />}
          Adjust Stock
        </button>
      </div>

      {/* Adjust stock inline form */}
      {showAdjust && (
        <div className="panel" style={{ marginBottom: 18, maxWidth: 480 }}>
          <div className="panel-heading" style={{ marginBottom: 14 }}>
            <h2>Adjust Stock</h2>
          </div>
          <form className="form-stack" onSubmit={handleAdjust}>
            <div className="form-row">
              <label>
                Direction
                <div style={{ marginTop: 7 }}>
                  <select
                    className="select-input"
                    style={{ width: "100%", height: 43 }}
                    value={adjust.direction}
                    onChange={(e) => setAdjust(a => ({ ...a, direction: e.target.value as "in" | "out" }))}
                  >
                    <option value="in">Stock In (add)</option>
                    <option value="out">Stock Out (remove)</option>
                  </select>
                </div>
              </label>
              <label>
                Quantity
                <div className="input-wrap" style={{ marginTop: 7 }}>
                  <input
                    type="number"
                    min="1"
                    value={adjust.quantity}
                    onChange={(e) => setAdjust(a => ({ ...a, quantity: e.target.value }))}
                    placeholder={`qty in ${product.unit}`}
                  />
                </div>
              </label>
            </div>
            <label>
              Notes <span className="muted" style={{ fontWeight: 400 }}>(optional)</span>
              <div className="input-wrap" style={{ marginTop: 7 }}>
                <input
                  value={adjust.notes}
                  onChange={(e) => setAdjust(a => ({ ...a, notes: e.target.value }))}
                  placeholder="Reason for adjustment…"
                />
              </div>
            </label>
            {adjustError && <div className="notice error">{adjustError}</div>}
            {adjustSuccess && <div className="notice">{adjustSuccess}</div>}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button type="button" className="subtle-button" onClick={() => setShowAdjust(false)}>Cancel</button>
              <button type="submit" className="primary-button" disabled={adjusting}>
                {adjusting ? <Loader2 size={14} className="spin" /> : null}
                Confirm
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Detail grid */}
      <div className="detail-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12, marginBottom: 20 }}>
        <div className="detail-box panel" style={{ padding: "16px 18px" }}>
          <div className="eyebrow">CURRENT STOCK</div>
          <div style={{ font: "700 24px Manrope,sans-serif", letterSpacing: "-0.5px", marginTop: 6, color: barColor }}>
            {product.current_stock} <span style={{ fontSize: 12, fontWeight: 500, color: "var(--muted)" }}>{product.unit}</span>
          </div>
          {(isLow || isOut) && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: barColor, marginTop: 4 }}>
              <AlertTriangle size={12} />
              {isOut ? "Out of stock" : "Low stock"}
            </div>
          )}
        </div>
        <div className="detail-box panel" style={{ padding: "16px 18px" }}>
          <div className="eyebrow">RESERVED</div>
          <div style={{ font: "700 24px Manrope,sans-serif", letterSpacing: "-0.5px", marginTop: 6 }}>
            {product.reserved_stock} <span style={{ fontSize: 12, fontWeight: 500, color: "var(--muted)" }}>{product.unit}</span>
          </div>
        </div>
        <div className="detail-box panel" style={{ padding: "16px 18px" }}>
          <div className="eyebrow">AVG COST (WAC)</div>
          <div style={{ font: "700 20px Manrope,sans-serif", letterSpacing: "-0.5px", marginTop: 6 }}>{money(product.cost_price)}</div>
        </div>
        <div className="detail-box panel" style={{ padding: "16px 18px" }}>
          <div className="eyebrow">LATEST PURCHASE</div>
          <div style={{ font: "700 20px Manrope,sans-serif", letterSpacing: "-0.5px", marginTop: 6 }}>
            {product.latest_purchase_price ? money(product.latest_purchase_price) : <span className="muted" style={{ fontSize: 13, fontWeight: 500 }}>—</span>}
          </div>
        </div>
        <div className="detail-box panel" style={{ padding: "16px 18px" }}>
          <div className="eyebrow">SELLING PRICE</div>
          <div style={{ font: "700 20px Manrope,sans-serif", letterSpacing: "-0.5px", marginTop: 6 }}>{money(product.selling_price)}</div>
        </div>
        <div className="detail-box panel" style={{ padding: "16px 18px" }}>
          <div className="eyebrow">MIN STOCK</div>
          <div style={{ font: "700 24px Manrope,sans-serif", letterSpacing: "-0.5px", marginTop: 6 }}>
            {product.minimum_stock} <span style={{ fontSize: 12, fontWeight: 500, color: "var(--muted)" }}>{product.unit}</span>
          </div>
        </div>
        <div className="detail-box panel" style={{ padding: "16px 18px" }}>
          <div className="eyebrow">UNIT / CATEGORY</div>
          <div style={{ fontWeight: 700, marginTop: 6, fontSize: 15 }}>{product.unit}</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{(product as any).categories?.name ?? (product as any).category?.name ?? "No category"}</div>
        </div>
      </div>

      {/* Stock bar */}
      {product.minimum_stock > 0 && (
        <div className="panel" style={{ padding: "14px 18px", marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#8795a6", letterSpacing: ".6px" }}>STOCK LEVEL</span>
            <span style={{ fontSize: 11, color: barColor, fontWeight: 700 }}>{stockPct}% of minimum</span>
          </div>
          <div style={{ height: 8, background: "#f0f3f7", borderRadius: 4, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${stockPct}%`, background: barColor, borderRadius: 4, transition: "width .4s ease" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5, fontSize: 10, color: "var(--muted)" }}>
            <span>0</span>
            <span>Min: {product.minimum_stock} {product.unit}</span>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="tab-bar" style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--line)", marginBottom: 20 }}>
        {([["edit", "Edit Details"], ["ledger", "Stock Ledger"], ["price", "Price History"]] as const).map(([key, label]) => (
          <button
            key={key}
            className={`tab${activeTab === key ? " selected" : ""}`}
            style={{
              border: 0,
              background: "transparent",
              padding: "10px 16px",
              fontWeight: 700,
              fontSize: 12,
              cursor: "pointer",
              color: activeTab === key ? "#246bfd" : "var(--muted)",
              borderBottom: activeTab === key ? "2px solid #246bfd" : "2px solid transparent",
              marginBottom: -1,
            }}
            onClick={() => setActiveTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === "edit" && (
        <ProductFormClient
          mode="edit"
          initialProduct={product}
          categories={categories}
          businessId={product.business_id}
        />
      )}
      {activeTab === "ledger" && <StockLedger productId={product.id} unit={product.unit} />}
      {activeTab === "price" && <PriceHistoryTable productId={product.id} businessId={product.business_id} />}
    </div>
  );
}
