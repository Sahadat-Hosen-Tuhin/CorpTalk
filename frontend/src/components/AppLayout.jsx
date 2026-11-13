import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { getAuthErrorMessage, useAuthStore } from '../stores/authStore.js';
import { createChatSocket } from '../services/chatSocket.js';
import { getAccessToken } from '../services/apiClient.js';
import { getFriendRequests } from '../services/chatApi.js';
import FormAlert from './FormAlert.jsx';

const linkClass = ({ isActive }) =>
  `rounded-full px-2 py-2 text-xs font-medium transition-colors sm:px-4 sm:text-sm ${
    isActive
      ? 'bg-brand-primary-soft text-brand-primary-text'
      : 'text-text-muted hover:bg-surface hover:text-heading'
  }`;

function AppLayout() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();
  const [logoutError, setLogoutError] = useState('');
  const [friendRequestCount, setFriendRequestCount] = useState(0);
  const [friendNotice, setFriendNotice] = useState('');

  useEffect(() => {
    if (!user?.id) return undefined;
    let active = true;
    const refreshRequestCount = () => {
      getFriendRequests()
        .then((requests) => {
          if (active) setFriendRequestCount(requests.incoming.length);
        })
        .catch((error) => {
          console.error('Could not refresh friend request count', error);
        });
    };
    const socket = createChatSocket();
    const handleFriendRequest = (request) => {
      setFriendNotice(`${request.user.name} sent you a friend request.`);
      refreshRequestCount();
    };
    const refreshSocketAuth = (event) => {
      socket.auth = { token: event?.detail?.accessToken ? event.detail.accessToken : getAccessToken() };
      socket.disconnect();
      socket.connect();
    };
    socket.on('friend:request', handleFriendRequest);
    socket.on('friend:accepted', refreshRequestCount);
    socket.on('friend:removed', refreshRequestCount);
    window.addEventListener('corptalk:auth-refreshed', refreshSocketAuth);
    refreshRequestCount();

    return () => {
      active = false;
      window.removeEventListener('corptalk:auth-refreshed', refreshSocketAuth);
      socket.off('friend:request', handleFriendRequest);
      socket.off('friend:accepted', refreshRequestCount);
      socket.off('friend:removed', refreshRequestCount);
      socket.disconnect();
    };
  }, [user?.id]);

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

          <nav
            className="flex max-w-[75%] flex-wrap items-center justify-end gap-0.5 sm:max-w-none sm:gap-1"
            aria-label="Main navigation"
          >
            <NavLink to="/dashboard" className={linkClass}>
              Dashboard
            </NavLink>
            <NavLink to="/chat" className={linkClass}>
              Chat
              {friendRequestCount > 0 && (
                <span className="ml-1 rounded-full bg-brand-primary px-1.5 py-0.5 text-[10px] text-on-primary">
                  {friendRequestCount}
                </span>
              )}
            </NavLink>
            <NavLink to="/profile" className={linkClass}>
              Profile
            </NavLink>
            <NavLink to="/setup" className={linkClass}>
              Setup
            </NavLink>
            <span className="hidden px-2 text-right text-sm text-text-muted md:inline">
              {user?.name}
              {user?.username && <span className="block text-xs">@{user.username}</span>}
            </span>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-full px-4 py-2 text-sm font-medium text-text-muted transition-colors hover:bg-surface hover:text-heading"
            >
              Sign out
            </button>
          </nav>
        </header>

        {friendNotice && (
          <div
            role="status"
            className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-brand-primary-soft px-4 py-2 text-sm text-brand-primary-text"
          >
            <span>{friendNotice}</span>
            <button type="button" onClick={() => setFriendNotice('')}>
              Dismiss
            </button>
          </div>
        )}
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
