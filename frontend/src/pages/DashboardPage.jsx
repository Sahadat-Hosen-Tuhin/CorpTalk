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
        <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-indigo-300/20 bg-indigo-300/5 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-200">
          <span className="h-1.5 w-1.5 rounded-full bg-indigo-300" />
          Phase 0 · Foundation
        </p>
        <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-6xl">
          Your workspace,
          <span className="block bg-gradient-to-r from-indigo-300 to-cyan-200 bg-clip-text text-transparent">
            ready to connect.
          </span>
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-slate-400 sm:text-lg">
          Check that the CorpTalk API and realtime gateway are reachable before building chat
          features on top.
        </p>
      </section>

      <section aria-labelledby="connections-title">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2
              id="connections-title"
              className="text-sm font-semibold uppercase tracking-wider text-slate-300"
            >
              Connection checks
            </h2>
            <p className="mt-1 text-sm text-slate-500">
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

      <section className="grid gap-4 rounded-3xl border border-white/10 bg-white/[0.03] p-6 sm:grid-cols-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Frontend</p>
          <p className="mt-2 font-medium text-white">React · Vite · Tailwind</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Backend</p>
          <p className="mt-2 font-medium text-white">Express · MongoDB · Mongoose</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Realtime</p>
          <p className="mt-2 font-medium text-white">Socket.IO</p>
        </div>
      </section>
    </div>
  );
}

export default DashboardPage;
