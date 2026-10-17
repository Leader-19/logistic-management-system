import { getSessionContext } from "../lib/session-context";
import NotificationBell from "./NotificationBell";
import ProfileMenu from "./ProfileMenu";
export default async function DashboardTopbar() {
  const context = await getSessionContext();
  return <header className="topbar"><div className="crumb">Workspace <span>/</span> <b>Operations</b></div><div className="top-actions"><NotificationBell /><ProfileMenu name={context.userName} avatarUrl={context.userAvatarUrl} /></div></header>;
}
