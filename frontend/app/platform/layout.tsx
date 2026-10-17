import PlatformSidebar from "./PlatformSidebar";

export default function PlatformLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="platform-layout"><PlatformSidebar/><div className="platform-layout-content">{children}</div></div>;
}
