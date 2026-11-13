import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { getAuthErrorMessage, useAuthStore } from '../stores/authStore.js';
import FormAlert from './FormAlert.jsx';

const linkClass = ({ isActive }) =>
  `rounded-full px-4 py-2 text-sm font-medium transition-colors ${
    isActive
      ? 'bg-brand-primary-soft text-brand-primary-text'
      : 'text-text-muted hover:bg-surface hover:text-heading'
  }`;

function AppLayout() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();
  const [logoutError, setLogoutError] = useState('');

  const handleLogout = async () => {
    setLogoutError('');
    try {
      await logout();
      navigate('/login', { replace: true });
    } catch (error) {
      const message = getAuthErrorMessage(error);
      setLogoutError(message);
      navigate('/login', { replace: true, state: { logoutError: message } });
    }
  };

  return (
    <div className="min-h-screen bg-bg text-text">
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -left-40 -top-40 h-96 w-96 rounded-full bg-brand-primary/10 blur-3xl" />
        <div className="absolute -right-32 top-1/4 h-80 w-80 rounded-full bg-brand-200/20 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-5 sm:px-8">
        <header className="flex items-center justify-between border-b border-border py-5">
          <NavLink to="/" className="flex items-center gap-3" aria-label="CorpTalk home">
            <img
              src="/icons/CorpTalk-Logo.png"
              alt=""
              className="h-11 w-11 rounded-xl bg-white object-contain p-0.5 shadow-sm ring-1 ring-border"
            />
            <span className="text-lg font-semibold tracking-tight text-heading">CorpTalk</span>
          </NavLink>

          <nav className="flex items-center gap-1" aria-label="Main navigation">
            <NavLink to="/dashboard" className={linkClass}>
              Dashboard
            </NavLink>
            <NavLink to="/profile" className={linkClass}>
              Profile
            </NavLink>
            <NavLink to="/setup" className={linkClass}>
              Setup
            </NavLink>
            <span className="hidden px-2 text-sm text-text-muted md:inline">{user?.name}</span>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-full px-4 py-2 text-sm font-medium text-text-muted transition-colors hover:bg-surface hover:text-heading"
            >
              Sign out
            </button>
          </nav>
        </header>

        <FormAlert>{logoutError}</FormAlert>
        <main className="flex-1 py-10 sm:py-14">
          <Outlet />
        </main>

        <footer className="border-t border-border py-5 text-xs text-text-muted">
          CorpTalk · Secure account and realtime presence
        </footer>
      </div>
    </div>
  );
}

export default AppLayout;
