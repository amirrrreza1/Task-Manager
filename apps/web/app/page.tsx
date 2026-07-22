const plannedCapabilities = [
  'Flexible task assignments',
  'Single-owner subtasks',
  'Time or point estimates',
  'Custom board columns',
  'Sprint planning and history',
  'Secure file attachments',
];

export default function Home() {
  return (
    <main className="shell">
      <section className="hero" aria-labelledby="page-title">
        <p className="eyebrow">Foundation release · v0.1</p>
        <h1 id="page-title">Task Manager</h1>
        <p className="lede">
          A focused, self-hosted workspace for teams that want clear ownership, practical estimates,
          configurable workflows, and sprint history without unnecessary complexity.
        </p>
        <div className="status" role="status">
          <span aria-hidden="true" />
          Project foundation is ready. Product screens are the next milestone.
        </div>
      </section>

      <section className="capabilities" aria-labelledby="capabilities-title">
        <div>
          <p className="section-label">First release</p>
          <h2 id="capabilities-title">Built around how work actually moves</h2>
        </div>
        <ul>
          {plannedCapabilities.map((capability) => (
            <li key={capability}>{capability}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
