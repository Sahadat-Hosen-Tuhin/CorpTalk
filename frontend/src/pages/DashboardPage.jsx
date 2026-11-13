import StatusCard from '../components/StatusCard.jsx';
import { useSystemStore } from '../stores/systemStore.js';

function DashboardPage() {
  const api = useSystemStore((state) => state.api);
  const socket = useSystemStore((state) => state.socket);
  const checkApi = useSystemStore((state) => state.checkApi);
  const pingSocket = useSystemStore((state) => state.pingSocket);

  return (
    <div className="space-y-10">
      <section className="max-w-3xl">
        <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-brand-primary/25 bg-brand-primary-soft px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-brand-primary-text">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-primary" />
          Phase 0 · Foundation
        </p>
        <h1 className="text-4xl font-semibold tracking-tight text-heading sm:text-6xl">
          Your workspace,
          <span className="block text-brand-primary">ready to connect.</span>
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-text-muted sm:text-lg">
          Check that the CorpTalk API and realtime gateway are reachable before building chat
          features on top.
        </p>
      </section>

      <section aria-labelledby="connections-title">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2
              id="connections-title"
              className="text-sm font-semibold uppercase tracking-wider text-brand-secondary"
            >
              Connection checks
            </h2>
            <p className="mt-1 text-sm text-text-muted">
              Run each check against your local backend.
            </p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <StatusCard
            title="Express API"
            status={api.status}
            description="Verifies the API health endpoint responds over HTTP."
            error={api.error}
            onCheck={checkApi}
          />
          <StatusCard
            title="Socket.IO"
            status={socket.status}
            description="Connects a realtime client and sends a health ping."
            error={socket.error}
            onCheck={pingSocket}
          />
        </div>
      </section>

      <section className="grid gap-4 rounded-3xl border border-border bg-bg-subtle p-6 sm:grid-cols-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">Frontend</p>
          <p className="mt-2 font-medium text-heading">React · Vite · Tailwind</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">Backend</p>
          <p className="mt-2 font-medium text-heading">Express · MongoDB · Mongoose</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">Realtime</p>
          <p className="mt-2 font-medium text-heading">Socket.IO</p>
        </div>
      </section>
    </div>
  );
}

export default DashboardPage;
