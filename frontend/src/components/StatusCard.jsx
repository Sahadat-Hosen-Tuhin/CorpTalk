const statusStyles = {
  idle: 'bg-slate-700',
  checking: 'bg-amber-400 animate-pulse',
  online: 'bg-emerald-400',
  offline: 'bg-rose-400',
};

function StatusCard({ title, status, description, error, onCheck }) {
  const statusLabel = {
    idle: 'Not checked',
    checking: 'Checking',
    online: 'Connected',
    offline: 'Unavailable',
  }[status];

  return (
    <article className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-xl shadow-black/10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-400">{title}</p>
          <div className="mt-3 flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${statusStyles[status]}`} />
            <h2 className="text-xl font-semibold text-white">{statusLabel}</h2>
          </div>
        </div>
        <button
          type="button"
          onClick={onCheck}
          disabled={status === 'checking'}
          className="rounded-xl border border-white/10 px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-indigo-400/50 hover:bg-indigo-400/10 disabled:cursor-wait disabled:opacity-50"
        >
          {status === 'checking' ? 'Checking…' : 'Test'}
        </button>
      </div>
      <p className="mt-4 text-sm leading-6 text-slate-400">{description}</p>
      {error && (
        <p className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/5 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      )}
    </article>
  );
}

export default StatusCard;
