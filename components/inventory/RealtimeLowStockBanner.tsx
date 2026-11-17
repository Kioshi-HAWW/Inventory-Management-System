"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { LowStockProduct } from "@/lib/types/inventory";
import { AlertTriangle, X } from "lucide-react";

interface RealtimeLowStockBannerProps {
  businessId: string;
  initialLowStock: LowStockProduct[];
}

export default function RealtimeLowStockBanner({
  businessId,
  initialLowStock,
}: RealtimeLowStockBannerProps) {
  const [lowStock, setLowStock] = useState<LowStockProduct[]>(initialLowStock);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`low-stock:${businessId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "products",
          filter: `business_id=eq.${businessId}`,
        },
        (payload) => {
          if (payload.eventType === "UPDATE") {
            const updated = payload.new as LowStockProduct & {
              current_stock: number;
              minimum_stock: number;
            };

            setLowStock((prev) => {
              const exists = prev.find((p) => p.id === updated.id);
              const isLow =
                updated.minimum_stock > 0 &&
                updated.current_stock <= updated.minimum_stock;

              if (isLow) {
                // Add or update in the list
                const entry: LowStockProduct = {
                  id: updated.id,
                  business_id: updated.business_id,
                  name: (updated as any).name,
                  sku: (updated as any).sku ?? null,
                  unit: (updated as any).unit,
                  current_stock: updated.current_stock,
                  minimum_stock: updated.minimum_stock,
                  cost_price: (updated as any).cost_price,
                  selling_price: (updated as any).selling_price,
                  category_name: (updated as any).category_name ?? null,
                };
                if (exists) {
                  return prev.map((p) => (p.id === updated.id ? entry : p));
                }
                setDismissed(false);
                return [...prev, entry];
              } else {
                // Remove from low stock list if stock is now OK
                return prev.filter((p) => p.id !== updated.id);
              }
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [businessId]);

  if (dismissed || lowStock.length === 0) return null;

  return (
    <div className="low-stock-banner">
      <AlertTriangle size={16} style={{ color: "#c98724", flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <strong>
          <span className="realtime-dot" />
          {lowStock.length} item{lowStock.length !== 1 ? "s" : ""} low on stock:
        </strong>{" "}
        {lowStock
          .map((p) => `${p.name} (${p.current_stock} ${p.unit})`)
          .join(", ")}
      </div>
      <button
        onClick={() => setDismissed(true)}
        style={{
          border: 0,
          background: "transparent",
          cursor: "pointer",
          color: "#9a6e00",
          padding: 2,
          display: "flex",
        }}
        type="button"
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  );
}
