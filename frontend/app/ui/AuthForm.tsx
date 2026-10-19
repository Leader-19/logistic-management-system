"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { showToast } from "./toast";

type Mode = "login" | "register";
type Membership = { tenantId: string; tenantName: string; tenantStatus: string };

export default function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [memberships, setMemberships] = useState<Membership[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function chooseTenant(tenantId: string, successMessage = mode === "register" ? "Workspace created successfully." : "Signed in successfully.") {
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/auth/tenant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId }),
      });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setError(data && typeof data === "object" && "message" in data && typeof data.message === "string" ? data.message : "Could not open this workspace.");
        setBusy(false);
        return;
      }
      showToast(successMessage);
      router.replace("/");
      router.refresh();
    } catch {
      setError("The workspace service is unavailable. Please try again.");
      setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const payload = mode === "login"
      ? { email: form.get("email"), password: form.get("password") }
      : { tenantName: form.get("tenantName"), fullName: form.get("fullName"), email: form.get("email"), password: form.get("password") };
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setError(data && typeof data === "object" && "message" in data && typeof data.message === "string" ? data.message : "Something went wrong. Please try again.");
        setBusy(false);
        return;
      }
      if (mode === "register" && data && typeof data === "object" && "tenant" in data && data.tenant && typeof data.tenant === "object" && "id" in data.tenant && typeof data.tenant.id === "string") {
        await chooseTenant(data.tenant.id);
        return;
      }
      if (data && typeof data === "object" && "platformAdmin" in data && data.platformAdmin === true) {
        showToast("Signed in successfully.");
        router.replace("/platform");
        router.refresh();
        return;
      }
      if (data && typeof data === "object" && "memberships" in data && Array.isArray(data.memberships)) {
        const active = data.memberships.filter((membership): membership is Membership =>
          membership && typeof membership === "object" && "tenantId" in membership && typeof membership.tenantId === "string" && "tenantName" in membership && typeof membership.tenantName === "string" && "tenantStatus" in membership && membership.tenantStatus === "ACTIVE",
        );
        if (active.length === 1) {
          await chooseTenant(active[0].tenantId);
          return;
        }
        setMemberships(active);
        if (active.length === 0) setError("This account does not have an active workspace.");
      } else {
        setError("The server returned an unexpected response.");
      }
      setBusy(false);
    } catch {
      setError("The authentication service is unavailable. Please try again.");
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <div className="auth-layout">
        <aside className="auth-visual" aria-label="LMS Portal logistics operations">
          <Image src="/image.jpg" alt="LMS Portal logistics operations" fill priority sizes="(max-width: 800px) 100vw, 50vw" className="auth-visual-image" />
          <div className="auth-visual-overlay">
            <span className="auth-visual-kicker">LMS PORTAL</span>
            <h2>Every delivery, moving forward.</h2>
            <p>Bring your team, shipments, and operations together in one workspace.</p>
          </div>
        </aside>
        <section className="auth-card" aria-labelledby="auth-title">
        <a className="auth-brand" href="/">LMS PORTAL<span>.</span></a>
        {memberships ? (
          <>
            <p className="auth-eyebrow">WORKSPACE ACCESS</p>
            <h1 id="auth-title">Choose a workspace</h1>
            <p className="auth-description">Select the company you want to work in.</p>
            <div className="workspace-options">
              {memberships.map((membership) => (
                <button className="workspace-option" key={membership.tenantId} onClick={() => void chooseTenant(membership.tenantId, "Signed in successfully.")} disabled={busy}>
                  <span className="workspace-badge">{membership.tenantName.slice(0, 1).toUpperCase()}</span>
                  <span>{membership.tenantName}</span>
                  <span className="workspace-arrow">→</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <p className="auth-eyebrow">LOGISTICS OPERATIONS</p>
            <h1 id="auth-title">{mode === "login" ? "Welcome back" : "Create your workspace"}</h1>
            <p className="auth-description">{mode === "login" ? "Sign in to manage your logistics operations." : "Set up your company workspace to get started."}</p>
            <form className="auth-form" onSubmit={submit}>
              {mode === "register" && <>
                <label>Company name<input name="tenantName" required minLength={2} maxLength={120} autoComplete="organization" /></label>
                <label>Your name<input name="fullName" required minLength={2} maxLength={120} autoComplete="name" /></label>
              </>}
              <label>Email address<input name="email" type="email" required maxLength={254} autoComplete="email" /></label>
              <label>Password<input name="password" type="password" required minLength={12} maxLength={128} autoComplete={mode === "login" ? "current-password" : "new-password"} /><small>Use at least 12 characters.</small></label>
              {error && <p className="auth-error" role="alert">{error}</p>}
              <button className="auth-submit" type="submit" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create workspace"}</button>
            </form>
            <p className="auth-switch">{mode === "login" ? "New to LMS Portal? " : "Already have an account? "}<a href={mode === "login" ? "/register" : "/login"}>{mode === "login" ? "Create a workspace" : "Sign in"}</a></p>
          </>
        )}
        {memberships && error && <p className="auth-error" role="alert">{error}</p>}
        </section>
      </div>
      <p className="auth-footer">Developed by DIN Leader · Secure, tenant-scoped logistics operations</p>
    </main>
  );
}
