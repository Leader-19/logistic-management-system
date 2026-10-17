"use client";
import { FormEvent, useState } from "react";
export default function AcceptInvitationForm({ token, passwordRequired }: { token: string; passwordRequired: boolean }) {
  const [password, setPassword] = useState(""); const [confirmPassword, setConfirmPassword] = useState(""); const [error, setError] = useState(""); const [complete, setComplete] = useState(false); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (!token) return setError("This invitation link is missing its token.");
    if (passwordRequired && password !== confirmPassword) return setError("The passwords do not match.");
    setBusy(true);
    try {
      const response = await fetch("/api/invitations/accept", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, ...(passwordRequired ? { password } : {}) }) });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) { const message = result && typeof result === "object" && "message" in result && typeof result.message === "string" ? result.message : "Could not accept this invitation."; throw new Error(message); }
      setComplete(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not accept this invitation."); }
    finally { setBusy(false); }
  }
  if (complete) return <div className="feedback success" role="status">Invitation accepted. <a href="/login">Sign in</a>.</div>;
  if (!token) return <div className="feedback error" role="alert">This invitation link is missing its token. Ask the person who invited you for a new link.</div>;
  return <form className="data-form" onSubmit={submit}>
    {error && <div className="feedback error" role="alert">{error}</div>}
    {passwordRequired ? <><label className="form-field"><span>Password (at least 12 characters)</span><input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={event => setPassword(event.target.value)} /></label><label className="form-field"><span>Confirm password</span><input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} /></label></> : <p className="muted-copy">This invitation is linked to an existing account. Accept it, then sign in with your existing password.</p>}
    <button className="primary-button" disabled={busy}>{busy ? "Accepting…" : "Accept invitation"}</button>
  </form>;
}
