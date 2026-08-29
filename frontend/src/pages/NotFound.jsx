import { Link } from '../lib/router.jsx';
import { useAuth } from '../lib/auth.jsx';

export default function NotFound() {
  const { isAuthenticated, role } = useAuth();
  const home = !isAuthenticated ? '/' : role === 'AGENT' ? '/app/my-round' : '/app';

  return (
    <div
      className="center"
      style={{ minHeight: '100vh', flexDirection: 'column', gap: 'var(--s-4)', padding: 'var(--s-6)' }}
    >
      <span className="num" style={{ font: 'var(--t-display)', color: 'var(--border-strong)' }}>
        404
      </span>
      <h1 style={{ font: 'var(--t-h2)' }}>That page is not on the round</h1>
      <p className="muted" style={{ maxWidth: '38ch', textAlign: 'center' }}>
        The link may be out of date, or the record it pointed at was removed.
      </p>
      <Link to={home} className="btn btn-primary">
        {isAuthenticated ? 'Back to my work' : 'Back to the home page'}
      </Link>
    </div>
  );
}
