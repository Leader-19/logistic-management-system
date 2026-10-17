"use client";
import Link from "next/link";
import LogoutButton from "../ui/LogoutButton";
export default function ProfileMenu({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  const initials = name.split(" ").filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase();
  return <details className="top-profile-menu"><summary aria-label={`Open profile menu for ${name}`}>{avatarUrl ? <img src={avatarUrl} alt="" /> : <span className="top-avatar-fallback">{initials}</span>}<span className="top-profile-name">{name}</span><span aria-hidden="true">⌄</span></summary><div className="top-profile-dropdown"><Link href="/profile">Profile</Link><LogoutButton /></div></details>;
}
