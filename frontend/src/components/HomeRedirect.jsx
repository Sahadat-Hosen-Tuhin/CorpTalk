import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore.js';
import PageLoader from './PageLoader.jsx';

function HomeRedirect() {
  const initialized = useAuthStore((state) => state.initialized);
  const user = useAuthStore((state) => state.user);

  if (!initialized) {
    return <PageLoader />;
  }
  return <Navigate to={user ? '/profile' : '/login'} replace />;
}

export default HomeRedirect;
