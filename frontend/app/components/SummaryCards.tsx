import { summaryStats } from "../(pages)/data/dashboard-data";

export default function SummaryCards() {
  return (
    <div className="stats-grid">
      {summaryStats.map((stat, index) => (
        <article className="stat-card" key={stat.label}>
          <div className={`stat-icon icon-${index}`}>{stat.icon}</div>
          <div className="stat-label">{stat.label}<span className="tiny-info">ⓘ</span></div>
          <div className="stat-bottom">
            <strong>{stat.value}</strong>
            <span className={`delta delta-${index}`}>{index === 0 && <span>↗ </span>}{stat.delta}</span>
          </div>
          <div className="sparkline" aria-hidden="true">
            <svg viewBox="0 0 140 30"><path d={stat.trend} /></svg>
          </div>
        </article>
      ))}
    </div>
  );
}
