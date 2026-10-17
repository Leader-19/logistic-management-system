"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";

type Profile = { id: string; email: string; fullName: string; phone: string | null; avatarUrl: string | null };

async function readMessage(response: Response) {
  const result: unknown = await response.json().catch(() => null);
  return result && typeof result === "object" && "message" in result && typeof result.message === "string" ? result.message : "Profile request failed.";
}

export default function ProfileForm() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/profile", { cache: "no-store" }).then(async response => {
      if (!response.ok) throw new Error(await readMessage(response));
      return response.json() as Promise<Profile>;
    }).then(data => {
      if (cancelled) return;
      setProfile(data);
      setFullName(data.fullName);
      setPhone(data.phone ?? "");
    }).catch(cause => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load your profile.");
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fullName, phone }) });
      if (!response.ok) throw new Error(await readMessage(response));
      const updated = await response.json() as Profile;
      setProfile(updated); setMessage("Profile updated successfully.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save your profile.");
    } finally { setBusy(false); }
  }

  async function uploadAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(""); setMessage("");
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) { setError("Choose a PNG, JPEG, or WebP image."); return; }
    if (file.size > 2 * 1024 * 1024) { setError("The image must be 2 MB or smaller."); return; }
    setBusy(true);
    try {
      const formData = new FormData(); formData.set("file", file);
      const response = await fetch("/api/profile/avatar", { method: "POST", body: formData });
      if (!response.ok) throw new Error(await readMessage(response));
      const updated = await response.json() as Profile;
      setProfile(updated); setMessage("Profile picture updated successfully.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not upload your profile picture.");
    } finally { setBusy(false); }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setMessage("");
    if (newPassword !== confirmPassword) { setError("New password and confirmation do not match."); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/profile/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword, newPassword }) });
      if (!response.ok) throw new Error(await readMessage(response));
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      setMessage("Password changed successfully.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not change your password.");
    } finally { setBusy(false); }
  }

  const initials = fullName.split(" ").filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "PA";
  if (loading) return <section className="profile-panel"><p role="status">Loading profile…</p></section>;

  return <div className="profile-page">
    <header className="platform-header"><div><p className="eyebrow">ACCOUNT SETTINGS</p><h1>Admin profile</h1><p>Update your platform administrator details and profile picture.</p></div></header>
    {error && <div className="feedback error" role="alert">{error}</div>}
    {message && <div className="feedback success" role="status">{message}</div>}
    <section className="profile-panel">
      <div className="profile-panel-heading"><div><h2>Profile picture</h2><p>PNG, JPEG, or WebP. Maximum size 2 MB.</p></div></div>
      <div className="profile-avatar-editor">
        {profile?.avatarUrl ? <img className="profile-avatar-image" src={profile.avatarUrl} alt={`${fullName}'s profile`} /> : <div className="profile-avatar-fallback">{initials}</div>}
        <label className="primary-button profile-upload-button">{busy ? "Please wait…" : "Upload picture"}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => void uploadAvatar(event)} disabled={busy} /></label>
      </div>
      <form className="profile-form" onSubmit={save}>
        <label className="form-field"><span>Full name</span><input required minLength={2} maxLength={120} value={fullName} onChange={event => setFullName(event.target.value)} /></label>
        <label className="form-field"><span>Email address</span><input value={profile?.email ?? ""} readOnly /><small>Email changes are disabled for platform admin accounts.</small></label>
        <label className="form-field"><span>Phone</span><input type="tel" maxLength={40} value={phone} onChange={event => setPhone(event.target.value)} /></label>
        <div className="profile-actions"><button className="primary-button" disabled={busy}>{busy ? "Saving…" : "Save profile"}</button></div>
      </form>
    </section>
    <section className="profile-panel password-panel">
      <div className="profile-panel-heading"><div><h2>Change password</h2><p>Confirm your current password and choose a new password of at least 12 characters.</p></div></div>
      <form className="profile-form password-form" onSubmit={event => void changePassword(event)}>
        <label className="form-field"><span>Current password</span><input type="password" autoComplete="current-password" minLength={12} maxLength={128} required value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} /></label>
        <label className="form-field"><span>New password</span><input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={newPassword} onChange={event => setNewPassword(event.target.value)} /></label>
        <label className="form-field"><span>Confirm new password</span><input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} /></label>
        <div className="profile-actions"><button className="primary-button" disabled={busy}>{busy ? "Updating…" : "Change password"}</button></div>
      </form>
    </section>
  </div>;
}
