import Link from "next/link";
import { cookies } from "next/headers";
import { getSessionContext } from "../lib/session-context";
import WorkspaceNavigation from "./WorkspaceNavigation";

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

export default async function DashboardSidebar() {
  const [context, cookieStore] = await Promise.all([getSessionContext(), cookies()]);
  const isPlatformAdmin = cookieStore.get("lms_platform_admin")?.value === "1";
  const permissions = Array.isArray(context.permissions) ? context.permissions : [];

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">{context.tenantLogoUrl ? <img src={context.tenantLogoUrl} alt="" /> : "L"}</span>
        <span>LMS Portal<span className="brand-dot">.</span><small>LOGISTICS OS</small></span>
      </div>
      <div className="workspace">
        <span className="workspace-icon">{initials(context.tenantName).slice(0, 1)}</span>
        <span><b>{context.tenantName}</b><small>Operations workspace</small></span>
        <span className="chevron">⌄</span>
      </div>
      <WorkspaceNavigation isPlatformAdmin={isPlatformAdmin} permissions={permissions} />
      <div className="sidebar-bottom">
        <Link className="profile sidebar-profile-link" href="/profile">
          <div className="avatar">
            {context.userAvatarUrl ? <img src={context.userAvatarUrl} alt="" /> : initials(context.userName)}
          </div>
          <span><b>{context.userName}</b><small>{context.roleName}</small></span>
          <span className="more">···</span>
        </Link>
      </div>
    </aside>
  );
}

