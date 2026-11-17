"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PriceHistory } from "@/lib/types/inventory";
import { Loader2, TrendingUp, TrendingDown, Minus } from "lucide-react";

const money = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(n);

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

interface PriceHistoryTableProps {
  productId: string;
  businessId?: string;
}

export default function PriceHistoryTable({
  productId,
  businessId,
}: PriceHistoryTableProps) {
  const [rows, setRows] = useState<PriceHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();

    async function fetch() {
      setLoading(true);
      setError(null);
      let query = supabase
        .from("price_history")
        .select("*")
        .eq("product_id", productId);

      if (businessId) {
        query = query.eq("business_id", businessId);
      }

      const { data, error: err } = await query.order("effective_at", { ascending: false });

      if (err) {
        setError(err.message);
      } else {
        setRows(data ?? []);
      }
      setLoading(false);
    }

    fetch();
  }, [productId, businessId]);

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "32px 0" }}>
        <Loader2 size={22} className="spin" style={{ color: "#246bfd" }} />
      </div>
    );
  }

  if (error) {
    return <div className="notice error">{error}</div>;
  }

  if (rows.length === 0) {
    return (
      <div className="empty-table">
        <TrendingUp size={28} />
        <p>No price history found.</p>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <div style={{ overflowX: "auto" }}>
        {/* Header */}
        <div
          className="price-hist-row"
          style={{ background: "#fafbfd", fontWeight: 700, fontSize: 10, color: "#8795a6", letterSpacing: ".8px", textTransform: "uppercase" }}
        >
          <span>Date</span>
          <span>Type</span>
          <span>Old Price</span>
          <span>New Price</span>
          <span>Change</span>
        </div>

        {rows.map((row) => {
          const diff = row.old_price != null ? row.new_price - row.old_price : null;
          const pct =
            diff != null && row.old_price
              ? ((diff / row.old_price) * 100).toFixed(1)
              : null;

          let ChangeIcon = Minus;
          let changeColor = "#8795a6";
          if (diff != null && diff > 0) {
            ChangeIcon = TrendingUp;
            changeColor = "#c0392b";
          } else if (diff != null && diff < 0) {
            ChangeIcon = TrendingDown;
            changeColor = "#139b72";
          }

          return (
            <div key={row.id} className="price-hist-row">
              <span className="muted">{fmtDate(row.effective_at)}</span>
              <span>
                <span
                  className={`badge ${row.price_type === "cost" ? "blue" : "green"}`}
                >
                  {row.price_type === "cost" ? "Cost" : "Selling"}
                </span>
              </span>
              <span>{row.old_price != null ? money(row.old_price) : <span className="muted">—</span>}</span>
              <span style={{ fontWeight: 600 }}>{money(row.new_price)}</span>
              <span style={{ display: "flex", alignItems: "center", gap: 4, color: changeColor, fontWeight: 600 }}>
                {diff != null ? (
                  <>
                    <ChangeIcon size={12} />
                    {diff > 0 ? "+" : ""}
                    {money(diff)}
                    {pct && (
                      <span className="muted" style={{ fontWeight: 400 }}>
                        ({pct}%)
                      </span>
                    )}
                  </>
                ) : (
                  <span className="muted">New entry</span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
