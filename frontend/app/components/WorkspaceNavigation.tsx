"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import MenuIcon, { type MenuIconName } from "../ui/MenuIcon";

type NavigationItem = { icon: MenuIconName; label: string; href: string; permission?: string; subitem?: boolean; children?: NavigationItem[] };
const workspaceLinks: NavigationItem[] = [
  { icon: "overview", label: "Overview", href: "/" },
  { icon: "shipments", label: "Shipments", href: "/shipments", permission: "shipments.read" },
  { icon: "packaging", label: "Package types", href: "/packages", permission: "packaging.types.read", subitem: true },
  { icon: "dispatch", label: "Dispatch", href: "/dispatch", permission: "shipments.assign" },
  { icon: "delivery", label: "Deliveries", href: "/driver", permission: "delivery.proof.create" },
  { icon: "fleet", label: "Fleet", href: "/fleet", permission: "fleet.read" },
  { icon: "invoices", label: "Invoices", href: "/invoices", permission: "invoices.read" },
  { icon: "products", label: "Supply chain", href: "/supply-chain", permission: "purchasing.read" },
  {
    icon: "inventory", label: "Inventory", href: "/inventory", permission: "warehouse.read",
    children: [
      { icon: "products", label: "Products", href: "/products", permission: "products.read" },
      { icon: "warehouses", label: "Warehouses", href: "/warehouses", permission: "warehouse.read" },
      { icon: "categories", label: "Categories", href: "/categories", permission: "products.read" },
    ],
  },
  { icon: "reports", label: "Reports", href: "/reports", permission: "reports.read" },
  { icon: "customers", label: "Customers", href: "/customers", permission: "customers.read" },
  { icon: "branches", label: "Branches", href: "/branches", permission: "branches.read" },
  { icon: "tracking", label: "Public tracking", href: "/track" },
];

const managementLinks: NavigationItem[] = [
  { icon: "users", label: "Users", href: "/team", permission: "members.read" },
  { icon: "invoices", label: "Billing & plan", href: "/billing", permission: "subscriptions.read" },
  { icon: "roles", label: "Roles", href: "/roles", permission: "roles.read" },
  { icon: "audit", label: "Audit history", href: "/audit", permission: "audit.read" },
  { icon: "settings", label: "Settings", href: "/settings", permission: "settings.read" },
  { icon: "profile", label: "My profile", href: "/profile" },
];

function hasPermission(grants: Set<string>, required?: string) {
  if (!required) return true;
  const [resource, action] = required.split(".");
  return grants.has(required) || grants.has(`${resource}.*`) || grants.has("*.*") ||
    (grants.has(`${resource}.manage`) && ["create", "read", "update", "delete", "export"].includes(action));
}

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({ item, grants, nested }: { item: NavigationItem; grants: Set<string>; nested?: boolean }) {
  const pathname = usePathname();
  const active = isActive(pathname, item.href);
  return (
    <Link aria-current={active ? "page" : undefined} className={`nav-item${active ? " active" : ""}${item.subitem || nested ? " nav-subitem" : ""}`} href={item.href}>
      <span className="nav-icon"><MenuIcon name={item.icon} /></span>{item.label}
    </Link>
  );
}

function NavGroup({ item, grants }: { item: NavigationItem; grants: Set<string> }) {
  const pathname = usePathname();
  const visibleChildren = (item.children ?? []).filter(child => hasPermission(grants, child.permission));
  const parentAllowed = hasPermission(grants, item.permission);
  const groupActive = isActive(pathname, item.href) || visibleChildren.some(child => isActive(pathname, child.href));
  return (
    <details className={`nav-group${groupActive ? " nav-group-active" : ""}`} open={groupActive}>
      <summary className={`nav-item${isActive(pathname, item.href) ? " active" : ""}`}>
        <span className="nav-icon"><MenuIcon name={item.icon} /></span>
        {parentAllowed
          ? <Link className="nav-group-link" href={item.href}>{item.label}</Link>
          : <span>{item.label}</span>}
        <span className="nav-chevron" aria-hidden="true">▾</span>
      </summary>
      <div className="nav-group-children">
        {visibleChildren.map(child => <NavLink item={child} grants={grants} nested key={child.href} />)}
      </div>
    </details>
  );
}

function NavigationLinks({ items, grants }: { items: NavigationItem[]; grants: Set<string> }) {
  return (
    <nav aria-label={items === workspaceLinks ? "Workspace" : "Management"}>
      {items.filter(item => item.children
        ? hasPermission(grants, item.permission) || item.children.some(child => hasPermission(grants, child.permission))
        : hasPermission(grants, item.permission)).map(item =>
          item.children
            ? <NavGroup item={item} grants={grants} key={item.href} />
            : <NavLink item={item} grants={grants} key={item.href} />)}
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
    {isPlatformAdmin && <div className="platform-nav"><Link className="nav-item" href="/platform"><span className="nav-icon"><MenuIcon name="platform" /></span>Platform console</Link></div>}
  </>;
}
