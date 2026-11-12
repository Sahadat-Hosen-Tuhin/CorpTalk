import { Link } from 'react-router-dom';

function NotFoundPage() {
  return (
    <section className="mx-auto max-w-xl py-16 text-center">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-indigo-200">404</p>
      <h1 className="mt-3 text-3xl font-semibold text-white">Page not found</h1>
      <p className="mt-3 text-slate-400">The page you requested does not exist.</p>
      <Link
        to="/"
        className="mt-7 inline-flex rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-400"
      >
        Back to dashboard
      </Link>
    </section>
  );
}

export default NotFoundPage;
