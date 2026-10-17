import { Request } from "express";

export interface TokenPayload {
  sub: string;
  iat: number;
  exp: number;
}

export interface AuthenticatedRequest extends Request {
  user: TokenPayload & { id: string };
  tenantId: string;
  membership: {
    id: string;
    tenantId: string;
    userId: string;
    status: string;
    branchId: string | null;
    membershipRoles: Array<{
      role: {
        id: string;
        name: string;
        rolePermissions: Array<{
          permission: {
            resource: string;
            action: string;
          };
        }>;
      };
    }>;
  };
  tenant: {
    id: string;
    name: string;
    slug: string;
    status: string;
  };
  platformSupportSession?: {
    id: string;
    adminUserId: string;
    tenantId: string;
    reason: string;
    permissionKeys: string[];
    expiresAt: Date;
  };
  platformAdmin?: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

