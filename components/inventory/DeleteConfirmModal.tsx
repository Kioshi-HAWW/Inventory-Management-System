"use client";

import { Loader2, AlertTriangle } from "lucide-react";

interface DeleteConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  destructive?: boolean;
}

export default function DeleteConfirmModal({
  open,
  title,
  message,
  onConfirm,
  onCancel,
  busy = false,
  destructive = true,
}: DeleteConfirmModalProps) {
  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          {destructive && (
            <AlertTriangle size={18} style={{ color: "#e53935", flexShrink: 0 }} />
          )}
          <h2 style={{ margin: 0 }}>{title}</h2>
        </div>
        <p>{message}</p>
        <div className="modal-actions">
          <button
            className="subtle-button"
            onClick={onCancel}
            disabled={busy}
            type="button"
          >
            Cancel
          </button>
          {destructive ? (
            <button
              className="danger-button"
              onClick={onConfirm}
              disabled={busy}
              type="button"
            >
              {busy ? (
                <Loader2 size={14} className="spin" style={{ display: "inline-block" }} />
              ) : (
                "Delete"
              )}
            </button>
          ) : (
            <button
              className="primary-button"
              onClick={onConfirm}
              disabled={busy}
              type="button"
            >
              {busy ? (
                <Loader2 size={14} className="spin" style={{ display: "inline-block" }} />
              ) : (
                "Confirm"
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
