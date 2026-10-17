import PanelHeader from "./PanelHeader";

export default function ShipmentActivityChart() {
  return (
    <article className="panel chart-panel">
      <PanelHeader
        title="Shipment activity"
        description="Track your shipment volume over time"
        action={<button className="select">Last 7 days <span>⌄</span></button>}
      />
      <div className="chart-legend">
        <span><i className="legend-blue" /> Shipments</span>
        <span><i className="legend-dash" /> Deliveries</span>
      </div>
      <div className="chart">
        <div className="y-labels"><span>1,200</span><span>900</span><span>600</span><span>300</span><span>0</span></div>
        <div className="chart-body">
          <div className="gridlines"><i /><i /><i /><i /><i /></div>
          <svg viewBox="0 0 700 175" preserveAspectRatio="none" className="chart-svg" aria-label="Shipment volume over the last seven days">
            <defs>
              <linearGradient id="fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#3467e8" stopOpacity=".16" />
                <stop offset="100%" stopColor="#3467e8" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path className="area" d="M0 130 C35 126 42 90 82 101 S125 120 165 83 205 92 247 72 285 96 330 77 371 60 411 68 452 88 495 53 535 69 578 42 625 53 700 22 V175 H0Z" />
            <path className="line" d="M0 130 C35 126 42 90 82 101 S125 120 165 83 205 92 247 72 285 96 330 77 371 60 411 68 452 88 495 53 535 69 578 42 625 53 700 22" />
            <path className="line secondary-line" d="M0 148 C38 143 48 128 82 134 S132 147 165 119 208 126 247 108 291 119 330 102 371 93 411 104 456 117 495 89 537 105 578 76 626 83 700 61" />
          </svg>
          <div className="x-labels"><span>Oct 10</span><span>Oct 11</span><span>Oct 12</span><span>Oct 13</span><span>Oct 14</span><span>Oct 15</span><span>Oct 16</span></div>
        </div>
      </div>
    </article>
  );
}
