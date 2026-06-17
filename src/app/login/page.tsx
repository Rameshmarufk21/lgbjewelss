"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next") || "/";
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, password }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; authDisabled?: boolean };
      if (!res.ok || !data.ok) {
        setError(data.error || "Login failed");
        return;
      }
      router.replace(next.startsWith("/") ? next : "/");
      router.refresh();
    } catch {
      setError("Could not reach server");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="login-card" onSubmit={onSubmit}>
      <div className="login-brand">
        {/* eslint-disable-next-line @next/next/no-img-element -- public asset; avoids Image config issues */}
        <img src="/lgb/nav-logo.png" alt="LabGrownBox" width={48} height={48} />
        <span className="login-brand-name">LabGrownBox</span>
      </div>
      <h1 className="login-title">Welcome back</h1>
      <p className="login-sub">Sign in to your internal operations workspace.</p>
      <label className="login-field">
        <span>Username</span>
        <input
          className="fc"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          autoComplete="username"
          placeholder="e.g. admin"
          autoFocus
          required
        />
      </label>
      <label className="login-field">
        <span>Password</span>
        <div className="login-password">
          <input
            className="fc"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            placeholder="Enter your password"
            required
          />
          <button
            type="button"
            className="login-password-toggle"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            tabIndex={-1}
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </label>
      {error ? <p className="login-error">{error}</p> : null}
      <button type="submit" className="btn btn-p login-submit" disabled={loading}>
        {loading ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="login-page">
      <Suspense fallback={<div className="login-card">Loading…</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
