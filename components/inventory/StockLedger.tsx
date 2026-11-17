"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { StockTransaction, StockTxnType } from "@/lib/types/inventory";
import { Loader2, ClipboardList, ChevronLeft, ChevronRight } from "lucide-react";

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

const PAGE_SIZE = 20;

const TXN_BADGE: Record<StockTxnType, { label: string; color: string }> = {
  purchase: { label: "Purchase", color: "blue" },
  issue: { label: "Issue", color: "amber" },
  adjustment_in: { label: "Adj In", color: "green" },
  adjustment_out: { label: "Adj Out", color: "red" },
  opening: { label: "Opening", color: "grey" },
  return: { label: "Return", color: "green" },
  reversal: { label: "Reversal", color: "red" },
  reservation: { label: "Reserved", color: "grey" },
  reservation_release: { label: "Rel.", color: "grey" },
  sale: { label: "Sale", color: "amber" },
};

interface StockLedgerProps {
  productId: string;
  unit?: string;
}

export default function StockLedger({ productId, unit = "pcs" }: StockLedgerProps) {
  const [rows, setRows] = useState<StockTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);

  const fetchPage = useCallback(
    async (pageIndex: number) => {
      const supabase = createClient();
      setLoading(true);
      setError(null);

      const from = pageIndex * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, error: err, count } = await supabase
        .from("stock_transactions")
        .select("*", { count: "exact" })
        .eq("product_id", productId)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (err) {
        setError(err.message);
      } else {
        setRows(data ?? []);
        setTotal(count ?? 0);
      }
      setLoading(false);
    },
    [productId]
  );

  useEffect(() => {
    fetchPage(0);
  }, [fetchPage]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const handlePage = (dir: number) => {
    const next = page + dir;
    if (next < 0 || next >= totalPages) return;
    setPage(next);
    fetchPage(next);
  };

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
        <ClipboardList size={28} />
        <p>No stock transactions yet.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="table-wrap">
        {/* Header */}
        <div
          className="ledger-row"
          style={{
            background: "#fafbfd",
            fontWeight: 700,
            fontSize: 10,
            color: "#8795a6",
            letterSpacing: ".8px",
            textTransform: "uppercase",
          }}
        >
          <span>Date</span>
          <span>Type</span>
          <span style={{ textAlign: "right" }}>Qty</span>
          <span style={{ textAlign: "right" }}>Unit Cost</span>
        </div>

        {rows.map((row) => {
          const badge = TXN_BADGE[row.transaction_type] ?? {
            label: row.transaction_type,
            color: "grey",
          };
          const isNegative =
            row.transaction_type === "issue" ||
            row.transaction_type === "adjustment_out" ||
            row.transaction_type === "reversal" ||
            row.transaction_type === "reservation" ||
            row.transaction_type === "sale";

          return (
            <div key={row.id} className="ledger-row" title={row.notes ?? undefined}>
              <span className="muted">{fmtDate(row.created_at)}</span>
              <span>
                <span className={`badge ${badge.color}`}>{badge.label}</span>
                {row.notes && (
                  <span className="muted" style={{ marginLeft: 6, fontSize: 11 }}>
                    {row.notes}
                  </span>
                )}
              </span>
              <span
                style={{
                  textAlign: "right",
                  fontWeight: 700,
                  color: isNegative ? "#c0392b" : "#139b72",
                }}
              >
                {isNegative ? "−" : "+"}
                {row.quantity} {unit}
              </span>
              <span style={{ textAlign: "right" }}>
                {row.unit_cost > 0 ? money(row.unit_cost) : <span className="muted">—</span>}
              </span>
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 8,
            marginTop: 12,
            fontSize: 12,
            color: "#8795a6",
          }}
        >
          <span>
            Page {page + 1} of {totalPages} &nbsp;·&nbsp; {total} records
          </span>
          <button
            className="icon-btn"
            onClick={() => handlePage(-1)}
            disabled={page === 0}
            type="button"
            aria-label="Previous page"
          >
            <ChevronLeft size={15} />
          </button>
          <button
            className="icon-btn"
            onClick={() => handlePage(1)}
            disabled={page >= totalPages - 1}
            type="button"
            aria-label="Next page"
          >
            <ChevronRight size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
