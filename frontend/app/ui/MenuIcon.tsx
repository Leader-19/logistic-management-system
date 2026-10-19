import type { ReactNode } from "react";

export type MenuIconName =
  | "overview" | "shipments" | "packaging" | "dispatch" | "delivery" | "fleet" | "invoices"
  | "inventory" | "products" | "warehouses" | "categories" | "reports"
  | "customers" | "branches" | "tracking" | "users" | "roles" | "audit"
  | "settings" | "profile" | "platform";

const iconContent: Record<MenuIconName, ReactNode> = {
  overview: <path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" />,
  shipments: <path d="m3 7 9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10M7.5 5l9 4" />,
  packaging: <path d="m4 7 8-4 8 4v10l-8 4-8-4zM4 7l8 4 8-4M12 11v10M8 5l8 4" />,
  dispatch: <path d="M4 7h15l-3-3m3 3-3 3M20 17H5l3 3m-3-3 3-3" />,
  delivery: <path d="M3 7h11v11H3zM14 11h4l3 3v4h-7zM7 18a2 2 0 1 0 4 0m5 0a2 2 0 1 0 4 0" />,
  fleet: <path d="M3 11h13l2-4h3v10h-2m-13 0H3zM7 17a2 2 0 1 0 4 0m6 0a2 2 0 1 0 4 0M5 7h8" />,
  invoices: <path d="M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7" />,
  inventory: <path d="m3 7 6-3 6 3-6 3zM3 7v7l6 3 6-3V7M15 10l3-2 3 2v7l-3 2-3-2zM9 10v7m9-9v9" />,
  products: <path d="m4 7 8-4 8 4v10l-8 4-8-4zM4 7l8 4 8-4M12 11v10M8 5l8 4" />,
  warehouses: <path d="m3 10 9-7 9 7M5 9v12h14V9M9 21v-7h6v7M8 11h2m4 0h2" />,
  categories: <path d="M20 13 12 21 3 12V4h8zM7.5 8h.01" />,
  reports: <path d="M4 20V10m5 10V4m5 16v-7m5 7V7M2 20h20" />,
  customers: <path d="M16 20v-1.5a4.5 4.5 0 0 0-4.5-4.5h-3A4.5 4.5 0 0 0 4 18.5V20m6-9a4 4 0 1 0 0-8 4 4 0 0 0 0 8m6-7a4 4 0 0 1 0 7m1 3h.5a4.5 4.5 0 0 1 4.5 4.5V20" />,
  branches: <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z m-5 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0" />,
  tracking: <path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1m-8.6 8.6-2.1 2.1M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" />,
  users: <path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m6-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8m6-7.5a4 4 0 0 1 0 7.8M20 21v-2a4 4 0 0 0-3-3.9" />,
  roles: <path d="m12 22 7-4V11c0-4-3-7-7-9-4 2-7 5-7 9v7zM9 12l2 2 4-4" />,
  audit: <path d="M8 3H5v18h14V8l-5-5zM14 3v5h5M8 13h4m-4 4h3m5-2v-2m0 0v-2m0 2h2m-2 0h-2" />,
  settings: <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4m0-12.8L17 7M7 17l-1.4 1.4" />,
  profile: <path d="M20 21a8 8 0 0 0-16 0m8-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />,
  platform: <path d="m12 2 9 5v10l-9 5-9-5V7zM8 12h8m-4-4v8" />,
};

export default function MenuIcon({ name }: { name: MenuIconName }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{iconContent[name]}</svg>;
}
