import { useEffect } from 'react';
import { navigate, useLocation, useRoutes } from './lib/router.jsx';
import { useAuth } from './lib/auth.jsx';
import AppShell from './components/AppShell.jsx';
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Approvals from './pages/Approvals.jsx';
import CustomerPortal from './pages/CustomerPortal.jsx';
import MyRound from './pages/MyRound.jsx';
import Runs from './pages/Runs.jsx';
import RunDetail from './pages/RunDetail.jsx';
import Customers from './pages/Customers.jsx';
import CustomerDetail from './pages/CustomerDetail.jsx';
import Beats from './pages/Beats.jsx';
import Products from './pages/Products.jsx';
import Invoices from './pages/Invoices.jsx';
import InvoiceDetail from './pages/InvoiceDetail.jsx';
import Collections from './pages/Collections.jsx';
import Settings from './pages/Settings.jsx';
import NotFound from './pages/NotFound.jsx';

/**
 * Route table and access control.
 *
 * Guards here are a usability layer, not the security boundary - every endpoint re-checks the role
 * server side. What they buy us is that an agent never lands on a screen full of 403s.
 */

const ALL = ['OWNER', 'MANAGER', 'AGENT'];
const MANAGE = ['OWNER', 'MANAGER'];

function homeFor(role) {
  return role === 'AGENT' ? '/app/my-round' : '/app';
}

function Splash({ label = 'Loading RouteLedger…' }) {
  return (
    <div className="center" style={{ minHeight: '100vh', flexDirection: 'column', gap: 'var(--s-4)' }}>
      <span className="spinner" style={{ width: 22, height: 22, borderWidth: 2 }} aria-hidden="true" />
      <span className="hint">{label}</span>
    </div>
  );
}

/** Requires a session, and optionally a role. Renders inside the operator shell. */
function Guarded({ roles = ALL, children }) {
  const { isAuthenticated, role } = useAuth();
  const { path, search } = useLocation();
  const allowed = isAuthenticated && roles.includes(role);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate(`/login?next=${encodeURIComponent(`${path}${search}`)}`, { replace: true });
    } else if (!roles.includes(role)) {
      navigate(homeFor(role), { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, role, path, search]);

  if (!allowed) return <Splash label="Checking your access…" />;
  return <AppShell>{children}</AppShell>;
}

/** Login and register bounce a signed-in operator straight to their home screen. */
function PublicOnly({ children }) {
  const { isAuthenticated, role } = useAuth();
  const { query } = useLocation();

  useEffect(() => {
    if (isAuthenticated) {
      navigate(query.next || homeFor(role), { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, role]);

  if (isAuthenticated) return <Splash label="Taking you in…" />;
  return children;
}

const ROUTES = [
  { path: '/', render: () => <Landing /> },
  { path: '/login', render: () => <PublicOnly><Login /></PublicOnly> },
  { path: '/register', render: () => <PublicOnly><Register /></PublicOnly> },

  // Customer Self-Service Portal
  { path: '/portal', render: () => <Guarded roles={ALL}><CustomerPortal /></Guarded> },

  { path: '/app', render: () => <Guarded roles={MANAGE}><Dashboard /></Guarded> },
  { path: '/app/approvals', render: () => <Guarded roles={['OWNER']}><Approvals /></Guarded> },
  { path: '/app/my-round', render: () => <Guarded roles={['AGENT']}><MyRound /></Guarded> },

  { path: '/app/runs', render: () => <Guarded roles={MANAGE}><Runs /></Guarded> },
  {
    path: '/app/runs/:id',
    render: (params) => (
      <Guarded roles={ALL}>
        <RunDetail runId={params.id} />
      </Guarded>
    ),
  },

  { path: '/app/customers', render: () => <Guarded roles={ALL}><Customers /></Guarded> },
  {
    path: '/app/customers/:id',
    render: (params) => (
      <Guarded roles={ALL}>
        <CustomerDetail customerId={params.id} />
      </Guarded>
    ),
  },

  { path: '/app/beats', render: () => <Guarded roles={MANAGE}><Beats /></Guarded> },
  { path: '/app/products', render: () => <Guarded roles={MANAGE}><Products /></Guarded> },

  { path: '/app/invoices', render: () => <Guarded roles={MANAGE}><Invoices /></Guarded> },
  {
    path: '/app/invoices/:id',
    render: (params) => (
      <Guarded roles={MANAGE}>
        <InvoiceDetail invoiceId={params.id} />
      </Guarded>
    ),
  },

  { path: '/app/collections', render: () => <Guarded roles={ALL}><Collections /></Guarded> },
  { path: '/app/settings', render: () => <Guarded roles={ALL}><Settings /></Guarded> },
];

const FALLBACK = () => <NotFound />;

export default function App() {
  const { booting } = useAuth();
  const element = useRoutes(ROUTES, FALLBACK);
  if (booting) return <Splash />;
  return element;
}
