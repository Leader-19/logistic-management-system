import PanelHeader from "./PanelHeader";

const serviceRates = [
  { name: "Express", rate: "98.2%", color: "blue" },
  { name: "Standard", rate: "95.8%", color: "purple" },
  { name: "Economy", rate: "93.1%", color: "pale" },
];

export default function ServicePerformance() {
  return (
    <article className="panel service-panel">
      <PanelHeader title="Service performance" description="Delivery success by service" action={<button className="dots" aria-label="More service options">···</button>} />
      <div className="donut-wrap">
        <div className="donut"><div className="donut-center"><b>96.4%</b><small>On-time rate</small></div></div>
      </div>
      <div className="service-list">
        {serviceRates.map((service) => (
          <div key={service.name}>
            <span><i className={`dot dot-${service.color}`} />{service.name}</span>
            <b>{service.rate}</b>
          </div>
        ))}
      </div>
    </article>
  );
}
