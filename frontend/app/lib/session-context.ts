import { cookies } from "next/headers";

type SessionContext = {
  userName: string;
  userAvatarUrl: string | null;
  tenantName: string;
  tenantLogoUrl: string | null;
  timezone: string;
  roleName: string;
  permissions: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function getSessionContext(): Promise<SessionContext> {
  const cookieStore = await cookies();
  const token = cookieStore.get("lms_session")?.value;
  const tenantId = cookieStore.get("lms_tenant")?.value;
  const supportSessionId = cookieStore.get("lms_support_session")?.value;
  if (!token || !tenantId) {
    return { userName: "Team member", userAvatarUrl: null, tenantName: "Workspace", tenantLogoUrl: null, timezone: "UTC", roleName: "Member", permissions: [] };
  }

  const apiUrl = process.env.API_INTERNAL_URL ?? "http://localhost:4000/api/v1";
  const headers = { Authorization: "Bearer " + token, "x-tenant-id": tenantId, ...(supportSessionId ? { "x-platform-support-session": supportSessionId } : {}) };
  try {
    const [profileResponse, tenantResponse] = await Promise.all([
      fetch(apiUrl + "/auth/me", { headers, cache: "no-store" }),
      fetch(apiUrl + "/auth/tenant-context", { headers, cache: "no-store" }),
    ]);
    const [profile, tenant]: [unknown, unknown] = await Promise.all([
      profileResponse.json().catch(() => null),
      tenantResponse.json().catch(() => null),
    ]);

    const userName = isRecord(profile) && typeof profile.fullName === "string" ? profile.fullName : "Team member";
    const userAvatarUrl = isRecord(profile) && typeof profile.avatarUrl === "string" ? profile.avatarUrl : null;
    const tenantName = isRecord(tenant) && typeof tenant.name === "string" ? tenant.name : "Workspace";
    const tenantLogoUrl = isRecord(tenant) && typeof tenant.logo === "string" ? tenant.logo : null;
    const timezone = isRecord(tenant) && typeof tenant.timezone === "string" ? tenant.timezone : "UTC";
    let roleName = "Member";
    const permissions = new Set<string>();
    if (isRecord(profile) && Array.isArray(profile.memberships)) {
      const membership = profile.memberships.find((item) => isRecord(item) && item.tenantId === tenantId);
      if (isRecord(membership) && Array.isArray(membership.membershipRoles)) {
        for (const item of membership.membershipRoles) {
          if (!isRecord(item) || !isRecord(item.role)) continue;
          if (typeof item.role.name === "string" && roleName === "Member") roleName = item.role.name;
          if (!Array.isArray(item.role.rolePermissions)) continue;
          for (const grant of item.role.rolePermissions) {
            if (!isRecord(grant) || !isRecord(grant.permission)) continue;
            const { resource, action } = grant.permission;
            if (typeof resource === "string" && typeof action === "string") permissions.add(`${resource}.${action}`);
          }
        }
      }
    }
    return { userName, userAvatarUrl, tenantName, tenantLogoUrl, timezone, roleName, permissions: [...permissions] };
  } catch {
    return { userName: "Team member", userAvatarUrl: null, tenantName: "Workspace", tenantLogoUrl: null, timezone: "UTC", roleName: "Member", permissions: [] };
  }
}


