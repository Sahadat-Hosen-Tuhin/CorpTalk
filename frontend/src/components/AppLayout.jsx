import { NavLink, Outlet } from 'react-router-dom';

const linkClass = ({ isActive }) =>
  `rounded-full px-4 py-2 text-sm font-medium transition ${
    isActive ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white'
  }`;

function AppLayout() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -left-40 -top-40 h-96 w-96 rounded-full bg-indigo-600/20 blur-3xl" />
        <div className="absolute -right-32 top-1/4 h-80 w-80 rounded-full bg-cyan-500/10 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-5 sm:px-8">
        <header className="flex items-center justify-between border-b border-white/10 py-5">
          <NavLink to="/" className="flex items-center gap-3" aria-label="CorpTalk home">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-indigo-500 font-bold text-white shadow-lg shadow-indigo-950/60">
              C
            </span>
            <span className="text-lg font-semibold tracking-tight text-white">CorpTalk</span>
          </NavLink>

          <nav className="flex items-center gap-1" aria-label="Main navigation">
            <NavLink to="/" end className={linkClass}>
              Dashboard
            </NavLink>
            <NavLink to="/setup" className={linkClass}>
              Setup
            </NavLink>
          </nav>
        </header>

        <main className="flex-1 py-10 sm:py-14">
          <Outlet />
        </main>

        <footer className="border-t border-white/10 py-5 text-xs text-slate-500">
          Phase 0 foundation · API, database and realtime connectivity
        </footer>
      </div>
    </div>
  );
}

export default AppLayout;
