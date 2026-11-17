"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, Plus, Edit2, Trash2, Package, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import StockBadge from "@/components/inventory/StockBadge";
import DeleteConfirmModal from "@/components/inventory/DeleteConfirmModal";
import RealtimeLowStockBanner from "@/components/inventory/RealtimeLowStockBanner";
import type { Product, Category, LowStockProduct } from "@/lib/types/inventory";

const money = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n);

type StockFilter = "all" | "low" | "out";

interface Props {
  products: Product[];
  categories: Category[];
  businessId: string;
  userRole: string;
  lowStock: LowStockProduct[];
}

export default function ProductListClient({ products: initialProducts, categories, businessId, userRole, lowStock: initialLowStock }: Props) {
  const router = useRouter();
  const supabase = createClient();

  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel(`products:business_id=eq.${businessId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "products", filter: `business_id=eq.${businessId}` },
        (payload) => {
          setProducts((prev) =>
            prev.map((p) =>
              p.id === payload.new.id ? { ...p, ...(payload.new as Partial<Product>) } : p
            )
          );
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [businessId]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return products.filter((p) => {
      const matchSearch = !q || p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q);
      const matchCat = categoryFilter === "all" || p.category_id === categoryFilter;
      const isOut = p.current_stock === 0;
      const isLow = !isOut && p.minimum_stock > 0 && p.current_stock <= p.minimum_stock;
      const matchStock =
        stockFilter === "all" ||
        (stockFilter === "out" && isOut) ||
        (stockFilter === "low" && isLow);
      return matchSearch && matchCat && matchStock;
    });
  }, [products, search, categoryFilter, stockFilter]);

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError("");
    const { error } = await supabase.rpc("soft_delete_product", { p_product_id: deleteTarget.id });
    setDeleting(false);
    if (error) {
      setDeleteError(error.message);
      return;
    }
    setProducts((prev) => prev.filter((p) => p.id !== deleteTarget.id));
    setDeleteTarget(null);
    router.refresh();
  }

  const isLowStock = (p: Product) => p.minimum_stock > 0 && p.current_stock <= p.minimum_stock && p.current_stock > 0;
  const isOutStock = (p: Product) => p.current_stock === 0;

  return (
    <>
      <RealtimeLowStockBanner businessId={businessId} initialLowStock={initialLowStock} />

      <div className="tab-bar">
        <Link href="/dashboard/inventory" className="tab active">
          Products
        </Link>
        <Link href="/dashboard/inventory/categories" className="tab">
          Categories
        </Link>
        <Link href="/dashboard/inventory/suppliers" className="tab">
          Suppliers
        </Link>
        <Link href="/dashboard/inventory/purchases" className="tab">
          Purchases
        </Link>
        <Link href="/dashboard/inventory/import" className="tab">
          Smart Import
        </Link>
      </div>

      <div className="inv-header">
        <div>
          <p className="eyebrow">INVENTORY</p>
          <h1>Products</h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            className="subtle-button"
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 14px", fontSize: 13, fontWeight: 700, color: "#246bfd" }}
            onClick={() => router.push("/dashboard/inventory/import")}
          >
            <Sparkles size={14} /> Smart Import
          </button>
          <button className="primary-button" onClick={() => router.push("/dashboard/inventory/new")}>
            <Plus size={15} /> Add product
          </button>
        </div>
      </div>

      <div className="inv-toolbar">
        <div className="inv-search">
          <Search size={14} />
          <input
            placeholder="Search by name or SKU…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <select
          className="select-input"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="all">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <select
          className="select-input"
          value={stockFilter}
          onChange={(e) => setStockFilter(e.target.value as StockFilter)}
        >
          <option value="all">All stock status</option>
          <option value="low">Low stock</option>
          <option value="out">Out of stock</option>
        </select>

        <span className="badge grey">{filtered.length} product{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>NAME / SKU</th>
              <th>CATEGORY</th>
              <th>UNIT</th>
              <th>STOCK</th>
              <th>AVG COST (WAC)</th>
              <th>SELLING PRICE</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7}>
                  <div className="empty-state">
                    <div className="empty-icon"><Package size={22} /></div>
                    <strong>No products found</strong>
                    <span>Try adjusting your search or filters.</span>
                  </div>
                </td>
              </tr>
            )}
            {filtered.map((p) => {
              const low = isLowStock(p);
              const out = isOutStock(p);
              return (
                <tr key={p.id} style={out || low ? { background: out ? "#fff6f5" : "#fffdf4" } : undefined}>
                  <td>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
                    {p.sku && <div className="muted" style={{ fontSize: 11 }}>{p.sku}</div>}
                  </td>
                  <td className="muted">{(p as any).categories?.name ?? (p as any).category?.name ?? "—"}</td>
                  <td className="muted">{p.unit}</td>
                  <td><StockBadge current={p.current_stock} minimum={p.minimum_stock} unit={p.unit} /></td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{money(p.cost_price)}</div>
                    {p.latest_purchase_price ? (
                      <div className="muted" style={{ fontSize: 11 }}>
                        Last: {money(p.latest_purchase_price)}
                      </div>
                    ) : null}
                  </td>
                  <td>{money(p.selling_price)}</td>
                  <td>
                    <div className="actions">
                      <button
                        className="subtle-button"
                        style={{ display: "flex", alignItems: "center", gap: 5 }}
                        onClick={() => router.push(`/dashboard/inventory/${p.id}`)}
                        title="Edit"
                      >
                        <Edit2 size={13} /> Edit
                      </button>
                      {(userRole === "owner" || userRole === "manager") && (
                        <button
                          className="danger-button"
                          style={{ padding: "8px 11px", fontSize: 12 }}
                          onClick={() => { setDeleteTarget(p); setDeleteError(""); }}
                          title="Delete"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {deleteError && <div className="notice error" style={{ marginTop: 12 }}>{deleteError}</div>}

      <DeleteConfirmModal
        open={!!deleteTarget}
        title="Delete product?"
        message={`"${deleteTarget?.name}" will be archived. Stock history is preserved. This cannot be undone.`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        busy={deleting}
        destructive
      />
    </>
  );
}
