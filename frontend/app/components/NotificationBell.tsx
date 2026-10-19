"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { apiRequest } from "../lib/api-client";
export default function NotificationBell() {
  const [unread, setUnread] = useState(0);
  useEffect(() => { let active = true; void apiRequest<{ unread: number }>("notifications?limit=1").then(result => { if (active) setUnread(result.unread); }).catch(() => undefined); return () => { active = false; }; }, []);
  return <Link className="top-notification" href="/notifications" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} title="Notifications"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></svg>{unread > 0 && <span className="notification-count">{unread > 9 ? "9+" : unread}</span>}</Link>;
}
