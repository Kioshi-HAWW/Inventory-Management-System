"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Zap, Lock, Loader2, CheckCircle2, ArrowLeft } from "lucide-react";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const router = useRouter();

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);

    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) throw updateError;

      setSuccess(true);
      setTimeout(() => {
        router.push("/dashboard");
        router.refresh();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="brand-mark">
          <Zap size={24} />
        </div>
        <p className="eyebrow">VOLT DESK &bull; SECURITY</p>
        <h1>Set new password</h1>
        <p className="muted">
          Choose a secure password with at least 6 characters.
        </p>

        {success ? (
          <div style={{ textAlign: "center", padding: "16px 0" }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: "#eaf8f2",
                color: "#139b72",
                display: "grid",
                placeItems: "center",
                margin: "0 auto 16px",
              }}
            >
              <CheckCircle2 size={28} />
            </div>
            <strong style={{ display: "block", fontSize: 16, marginBottom: 6 }}>
              Password updated!
            </strong>
            <p className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
              Your password has been changed successfully. Redirecting you to the workspace...
            </p>
            <button
              className="primary-button"
              style={{ width: "100%" }}
              onClick={() => router.push("/dashboard")}
            >
              Go to Dashboard
            </button>
          </div>
        ) : (
          <form onSubmit={handleReset} className="form-stack">
            <label>
              New password
              <div className="input-wrap">
                <Lock size={17} />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  disabled={busy}
                />
              </div>
            </label>

            <label>
              Confirm new password
              <div className="input-wrap">
                <Lock size={17} />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your password"
                  disabled={busy}
                />
              </div>
            </label>

            <button className="primary-button" disabled={busy}>
              {busy ? <Loader2 className="spin" size={18} /> : null}
              Update password
            </button>
          </form>
        )}

        {error && <div className="notice error">{error}</div>}

        <p className="switch-mode" style={{ marginTop: 22 }}>
          <Link
            href="/login"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              color: "#246bfd",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            <ArrowLeft size={14} /> Back to Sign in
          </Link>
        </p>
      </section>
    </main>
  );
}
