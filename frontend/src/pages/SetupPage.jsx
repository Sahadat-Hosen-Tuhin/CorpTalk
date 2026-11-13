const setupItems = [
  {
    title: 'Backend environment',
    detail: 'Set MONGODB_URI in backend/.env before starting the API.',
  },
  {
    title: 'Start the API',
    detail: 'From backend/, run npm run dev. The server connects to MongoDB before listening.',
  },
  {
    title: 'Start the client',
    detail: 'From frontend/, run npm run dev and open the Vite URL.',
  },
  {
    title: 'Verify connectivity',
    detail: 'Return to the dashboard and test both the HTTP API and Socket.IO ping.',
  },
];

function SetupPage() {
  return (
    <section className="mx-auto max-w-3xl">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand-primary-text">
        Getting started
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-heading sm:text-4xl">
        Local setup checklist
      </h1>
      <p className="mt-4 text-base leading-7 text-text-muted">
        Configure the database connection locally, then use the dashboard to validate the server and
        realtime handshake.
      </p>

      <ol className="mt-8 space-y-3">
        {setupItems.map((item, index) => (
          <li
            key={item.title}
            className="flex gap-4 rounded-2xl border border-border bg-bg-subtle p-5"
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-primary-soft text-sm font-semibold text-brand-primary-text">
              {index + 1}
            </span>
            <div>
              <h2 className="font-semibold text-heading">{item.title}</h2>
              <p className="mt-1 text-sm leading-6 text-text-muted">{item.detail}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default SetupPage;
