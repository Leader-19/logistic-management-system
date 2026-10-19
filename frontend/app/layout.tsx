import type { Metadata } from "next";
import ToastViewport from "./ui/ToastViewport";
import "./styles.css";

export const metadata: Metadata = { title: "LMS Portal | Logistics operations", description: "A clear view of every shipment and delivery." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" data-scroll-behavior="smooth"><body>{children}<ToastViewport /></body></html>;
}
