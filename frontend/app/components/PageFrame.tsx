import DashboardSidebar from "./DashboardSidebar";
import DashboardTopbar from "./DashboardTopbar";
import DashboardFooter from "./DashboardFooter";

export default function PageFrame({ children }: { children: React.ReactNode }) {
  return <main className="shell"><DashboardSidebar/><section className="content"><DashboardTopbar/><div className="page-wrap">{children}</div><div className="page-foot"><DashboardFooter/></div></section></main>;
}
