import PlatformSidebar from "./PlatformSidebar";
import DashboardFooter from "../components/DashboardFooter";

export default function PlatformLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="platform-layout"><PlatformSidebar/><div className="platform-layout-content">{children}<div className="page-foot"><DashboardFooter/></div></div></div>;
}
