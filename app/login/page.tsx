"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Zap,
  Mail,
  Lock,
  User,
  Chrome,
  Loader2,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
} from "lucide-react";

type AuthMode = "signin" | "signup" | "forgot" | "verify-sent";

function LoginForm() {
  const [mode, setMode] = useState<AuthMode>("signin");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [infoMessage, setInfoMessage] = useState("");
  const [resendSuccess, setResendSuccess] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();

  // Check URL query parameters for callback errors or messages
  useEffect(() => {
    const errorParam = searchParams.get("error");
    if (errorParam) {
      if (errorParam === "auth_callback_failed") {
        setErrorMessage("Authentication failed or verification link expired. Please try again.");
      } else if (errorParam === "reset_link_expired") {
        setErrorMessage("Password reset link has expired. Please request a new one.");
      } else {
        setErrorMessage(decodeURIComponent(errorParam));
      }
    }

    if (searchParams.get("verified") === "true") {
      setInfoMessage("Email confirmed successfully! You can now sign in.");
    }
  }, [searchParams]);

  // Handle Form Submission
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrorMessage("");
    setInfoMessage("");
    setResendSuccess(false);

    try {
      const supabase = createClient();

      if (mode === "signup") {
        if (!fullName.trim()) {
          throw new Error("Please enter your full name.");
        }
        if (password.length < 6) {
          throw new Error("Password must be at least 6 characters.");
        }

        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              full_name: fullName.trim(),
            },
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });

        if (error) throw error;

        // If email confirmation is required and session is not returned immediately
        if (data.user && !data.session) {
          setMode("verify-sent");
        } else if (data.session) {
          router.push("/dashboard");
          router.refresh();
        }
      } else if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) {
          if (error.message.toLowerCase().includes("invalid login credentials")) {
            throw new Error("Invalid email or password. Please check and try again.");
          }
          if (error.message.toLowerCase().includes("email not confirmed")) {
            setMode("verify-sent");
            throw new Error("Please confirm your email address before signing in.");
          }
          throw error;
        }

        router.push("/dashboard");
        router.refresh();
      } else if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset-password`,
        });

        if (error) throw error;

        setInfoMessage(
          `Password reset instructions have been sent to ${email.trim()}. Please check your inbox.`
        );
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setBusy(false);
    }
  }

  // Google OAuth Login
  async function handleGoogleAuth() {
    setBusy(true);
    setErrorMessage("");
    setInfoMessage("");

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      });

      if (error) throw error;
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Google sign-in failed.");
      setBusy(false);
    }
  }

  // Resend Email Verification Link
  async function handleResendVerification() {
    if (!email) return;
    setResending(true);
    setErrorMessage("");
    setResendSuccess(false);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: email.trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) throw error;
      setResendSuccess(true);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to resend confirmation email.");
    } finally {
      setResending(false);
    }
  }

  // Verification Pending Screen
  if (mode === "verify-sent") {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <div className="brand-mark">
            <Zap size={24} />
          </div>
          <p className="eyebrow">VERIFICATION REQUIRED</p>
          <h1>Check your email</h1>
          <p className="muted">
            We sent a verification link to <strong style={{ color: "var(--text)" }}>{email}</strong>.
            Click the link in the email to activate your VoltDesk account.
          </p>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "16px",
              background: "#edf3ff",
              borderRadius: "10px",
              marginBottom: "20px",
            }}
          >
            <Mail size={24} style={{ color: "#246bfd", flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: "#32435f", lineHeight: 1.5 }}>
              Check your inbox and spam folder. Once verified, you will be redirected to setup your
              electrical contractor workspace.
            </span>
          </div>

          {resendSuccess && (
            <div className="notice" style={{ background: "#eaf8f2", borderColor: "#c3edd9", color: "#139b72", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <CheckCircle2 size={16} />
                <span>Verification email resent successfully!</span>
              </div>
            </div>
          )}

          {errorMessage && <div className="notice error" style={{ marginBottom: 14 }}>{errorMessage}</div>}

          <button
            className="subtle-button"
            style={{ width: "100%", height: 42, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 14 }}
            onClick={handleResendVerification}
            disabled={resending}
          >
            {resending ? <Loader2 className="spin" size={16} /> : <RefreshCw size={15} />}
            Resend verification email
          </button>

          <p className="switch-mode">
            <button
              onClick={() => {
                setMode("signin");
                setErrorMessage("");
                setInfoMessage("");
              }}
              style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
            >
              <ArrowLeft size={14} /> Back to Sign in
            </button>
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="brand-mark">
          <Zap size={24} />
        </div>
        <p className="eyebrow">VOLT DESK &bull; CONTRACTOR ERP</p>
        <h1>
          {mode === "signin"
            ? "Welcome back"
            : mode === "signup"
            ? "Create your account"
            : "Reset your password"}
        </h1>
        <p className="muted">
          {mode === "signin"
            ? "Manage inventory, projects, and invoices in one place."
            : mode === "signup"
            ? "Set up your electrical contracting workspace in minutes."
            : "Enter your email to receive password reset instructions."}
        </p>

        {/* OAuth is shown on signin and signup modes */}
        {mode !== "forgot" && (
          <>
            <button
              type="button"
              className="google-button"
              onClick={handleGoogleAuth}
              disabled={busy}
            >
              <Chrome size={18} /> Continue with Google
            </button>
            <div className="or">
              <span />
              or continue with email
              <span />
            </div>
          </>
        )}

        {infoMessage && (
          <div
            className="notice"
            style={{
              background: "#eaf8f2",
              borderColor: "#c3edd9",
              color: "#139b72",
              marginBottom: 14,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
            <span>{infoMessage}</span>
          </div>
        )}

        {errorMessage && (
          <div className="notice error" style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="form-stack">
          {mode === "signup" && (
            <label>
              Full name
              <div className="input-wrap">
                <User size={17} />
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Rajesh Kumar"
                  disabled={busy}
                />
              </div>
            </label>
          )}

          <label>
            Email address
            <div className="input-wrap">
              <Mail size={17} />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                disabled={busy}
              />
            </div>
          </label>

          {mode !== "forgot" && (
            <label>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Password</span>
                {mode === "signin" && (
                  <button
                    type="button"
                    onClick={() => {
                      setMode("forgot");
                      setErrorMessage("");
                      setInfoMessage("");
                    }}
                    style={{
                      border: 0,
                      background: "transparent",
                      color: "#246bfd",
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="input-wrap">
                <Lock size={17} />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === "signup" ? "At least 6 characters" : "Enter your password"}
                  disabled={busy}
                />
              </div>
            </label>
          )}

          <button className="primary-button" disabled={busy} type="submit">
            {busy ? <Loader2 className="spin" size={18} /> : null}
            {mode === "signin"
              ? "Sign in"
              : mode === "signup"
              ? "Create account"
              : "Send reset link"}
          </button>
        </form>

        {mode === "forgot" ? (
          <p className="switch-mode" style={{ marginTop: 20 }}>
            <button
              onClick={() => {
                setMode("signin");
                setErrorMessage("");
                setInfoMessage("");
              }}
              style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
            >
              <ArrowLeft size={14} /> Back to Sign in
            </button>
          </p>
        ) : (
          <p className="switch-mode">
            {mode === "signin" ? "New to VoltDesk?" : "Already have an account?"}{" "}
            <button
              type="button"
              onClick={() => {
                setMode(mode === "signin" ? "signup" : "signin");
                setErrorMessage("");
                setInfoMessage("");
              }}
            >
              {mode === "signin" ? "Create account" : "Sign in"}
            </button>
          </p>
        )}

        <p className="tiny muted">
          By continuing, you agree to use this workspace for authorized electrical contractor
          business activity.
        </p>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="auth-shell">
          <section className="auth-card" style={{ display: "grid", placeItems: "center", minHeight: 350 }}>
            <Loader2 className="spin" size={28} style={{ color: "#246bfd" }} />
          </section>
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
