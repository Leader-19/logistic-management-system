import Link from "next/link";
import { cookies } from "next/headers";
import LogoutButton from "../ui/LogoutButton";
import MenuIcon from "../ui/MenuIcon";

type Profile = { fullName?: string; email?: string; avatarUrl?: string | null };

export default async function PlatformSidebar() {
  const cookieStore = await cookies();
  const token = cookieStore.get("lms_session")?.value;
  let profile: Profile | null = null;
  if (token) {
    try {
      const apiUrl = process.env.API_INTERNAL_URL ?? "http://localhost:4000/api/v1";
      const response = await fetch(`${apiUrl}/auth/me`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      if (response.ok) profile = await response.json() as Profile;
    } catch { /* Keep the sidebar usable when profile data is temporarily unavailable. */ }
  }
  const initials = profile?.fullName?.split(" ").filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "PA";

  return <aside className="platform-sidebar">
    <Link className="platform-brand" href="/platform"><span className="platform-brand-mark">L</span><span>LMS Portal<small>PLATFORM ADMIN</small></span></Link>
    <div className="platform-sidebar-label">CONTROL CENTER</div>
    <nav className="platform-sidebar-nav" aria-label="Platform administration">
      <Link href="/platform"><span className="nav-icon"><MenuIcon name="overview" /></span>Overview</Link>
      <Link href="/platform/tenants"><span className="nav-icon"><MenuIcon name="branches" /></span>Tenants</Link>
      <Link href="/platform/billing"><span className="nav-icon"><MenuIcon name="invoices" /></span>Plans & billing</Link>
      <Link href="/platform/profile"><span className="nav-icon"><MenuIcon name="profile" /></span>Admin profile</Link>
    </nav>
    <div className="platform-sidebar-footer">
      <Link className="platform-admin-card" href="/platform/profile">
        {profile?.avatarUrl ? <img src={profile.avatarUrl} alt="" /> : <span className="platform-avatar-fallback">{initials}</span>}
        <span><b>{profile?.fullName ?? "Platform admin"}</b><small>{profile?.email ?? "Administrator"}</small></span>
      </Link>
      <LogoutButton />
    </div>
  </aside>;
}
