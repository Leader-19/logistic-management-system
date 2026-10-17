import { getSessionContext } from "../lib/session-context";

export default async function WelcomeHeader() {
  const context = await getSessionContext();
  const now = new Date();
  const hour = Number(new Intl.DateTimeFormat("en", { hour: "numeric", hour12: false, timeZone: context.timezone }).format(now));
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const date = new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: context.timezone }).format(now);
  const firstName = context.userName.split(" ")[0];

  return (
    <div className="welcome-row">
      <div>
        <div className="eyebrow">{date.toUpperCase()} <span className="weather">Operations overview</span></div>
        <h1>{greeting}, {firstName} <span>✳</span></h1>
        <p>Here’s what’s happening across your operations today.</p>
      </div>
      <div className="header-buttons">
        <button className="button secondary">↧ <span>Export</span></button>
        <button className="button primary">＋ <span>New shipment</span></button>
      </div>
    </div>
  );
}
