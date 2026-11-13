import { Link } from 'react-router-dom';

function AuthHeader() {
  return (
    <header className="flex items-center justify-between py-6">
      <Link to="/" className="flex items-center gap-3" aria-label="CorpTalk home">
        <img
          src="/icons/CorpTalk-Logo.png"
          alt=""
          className="h-10 w-10 rounded-xl bg-white object-contain p-0.5 shadow-sm ring-1 ring-border"
        />
        <span className="text-lg font-semibold tracking-tight text-heading">CorpTalk</span>
      </Link>
      <span className="hidden text-sm text-text-muted sm:block">A better way to work together</span>
    </header>
  );
}

export default AuthHeader;
