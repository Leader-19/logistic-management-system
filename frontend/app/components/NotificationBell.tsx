"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { apiRequest } from "../lib/api-client";
export default function NotificationBell() {
  const [unread, setUnread] = useState(0);
  useEffect(() => { let active = true; void apiRequest<{ unread: number }>("notifications?limit=1").then(result => { if (active) setUnread(result.unread); }).catch(() => undefined); return () => { active = false; }; }, []);
  return <Link className="top-notification" href="/notifications" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} title="Notifications">♧{unread > 0 && <span className="notification-count">{unread > 9 ? "9+" : unread}</span>}</Link>;
}
