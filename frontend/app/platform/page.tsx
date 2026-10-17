import { cookies } from "next/headers";
import PlatformConsole from "./PlatformConsole";

export default async function PlatformPage() {
  const cookieStore = await cookies();
  return <main className="platform-shell"><PlatformConsole activeSessionId={cookieStore.get("lms_support_session")?.value ?? ""} /></main>;
}
