"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavigationItem = { icon: string; label: string; href: string; permission?: string; subitem?: boolean };
const workspaceLinks: NavigationItem[] = [
  { icon: "▦", label: "Overview", href: "/" },
  { icon: "□", label: "Shipments", href: "/shipments", permission: "shipments.read" },
  { icon: "⇄", label: "Dispatch", href: "/dispatch", permission: "shipments.assign" },
  { icon: "♟", label: "My deliveries", href: "/driver", permission: "delivery.proof.create" },
  { icon: "▣", label: "Fleet", href: "/fleet", permission: "fleet.read" },
  { icon: "▤", label: "Invoices", href: "/invoices", permission: "invoices.read" },
  { icon: "▥", label: "Inventory", href: "/inventory", permission: "warehouse.read" },
  { icon: "◫", label: "Products", href: "/products", permission: "products.read", subitem: true },
  { icon: "▣", label: "Warehouses", href: "/warehouses", permission: "warehouse.read", subitem: true },
  { icon: "▦", label: "Categories", href: "/categories", permission: "products.read", subitem: true },
  { icon: "▧", label: "Reports", href: "/reports", permission: "reports.read" },
  { icon: "♙", label: "Customers", href: "/customers", permission: "customers.read" },
  { icon: "⌖", label: "Branches", href: "/branches", permission: "branches.read" },
  { icon: "⌕", label: "Public tracking", href: "/track" },
];

const managementLinks = [
  { icon: "♧", label: "Users", href: "/team", permission: "members.read" },
  { icon: "▤", label: "Roles", href: "/roles", permission: "roles.read" },
  { icon: "◷", label: "Audit history", href: "/audit", permission: "audit.read" },
  { icon: "⚙", label: "Settings", href: "/settings", permission: "settings.read" },
  { icon: "♙", label: "My profile", href: "/profile" },
];

function hasPermission(grants: Set<string>, required?: string) {
  if (!required) return true;
  const [resource, action] = required.split(".");
  return grants.has(required) || grants.has(`${resource}.*`) || grants.has("*.*") ||
    (grants.has(`${resource}.manage`) && ["create", "read", "update", "delete", "export"].includes(action));
}

function NavigationLinks({ items, grants }: { items: NavigationItem[]; grants: Set<string> }) {
  const pathname = usePathname();
  return (
    <nav aria-label={items === workspaceLinks ? "Workspace" : "Management"}>
      {items.filter(item => hasPermission(grants, item.permission)).map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link aria-current={active ? "page" : undefined} className={`nav-item${active ? " active" : ""}${item.subitem ? " nav-subitem" : ""}`} href={item.href} key={item.href}>
            <span aria-hidden="true">{item.icon}</span>{item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export default function WorkspaceNavigation({ isPlatformAdmin, permissions }: { isPlatformAdmin: boolean; permissions: string[] }) {
  const grants = new Set(permissions);
  return <>
    <div className="nav-label">WORKSPACE</div>
    <NavigationLinks items={workspaceLinks} grants={grants} />
    <div className="nav-label tools-label">MANAGE</div>
    <NavigationLinks items={managementLinks} grants={grants} />
    {isPlatformAdmin && <div className="platform-nav"><Link className="nav-item" href="/platform"><span aria-hidden="true">⬡</span>Platform console</Link></div>}
  </>;
}
