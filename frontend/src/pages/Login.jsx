import { useState } from 'react';
import { Link, navigate, useLocation } from '../lib/router.jsx';
import { useAuth } from '../lib/auth.jsx';
import { useCustomerAuth } from '../lib/customerAuth.jsx';
import { useToast } from '../lib/toast.jsx';
import { Field, SubmitButton } from '../components/ui.jsx';
import styles from './Auth.module.css';

const ROLES = [
  {
    key: 'CUSTOMER',
    label: '🍱 Customer',
    title: 'Customer Portal Login',
    sub: 'Explore local cloud kitchens, manage daily subscriptions, and skip days with 1 tap.',
    demoEmail: '9822011111',
    demoPass: 'Customer@123',
    demoName: 'Sunil Joshi',
    target: '/customer',
  },
  {
    key: 'OWNER',
    label: '🏪 Owner',
    title: 'Business Owner Login',
    sub: 'Authorize advance customer approvals, view financial ledger, and manage routes.',
    demoEmail: 'owner@amrutdairy.in',
    demoPass: 'Demo@12345',
    demoName: 'Suresh Kulkarni (Owner)',
    target: '/app',
  },
  {
    key: 'MANAGER',
    label: '📋 Manager',
    title: 'Kitchen & Route Manager Login',
    sub: 'Kitchen batch quantities, dispatch scheduling, and customer records.',
    demoEmail: 'meera@amrutdairy.in',
    demoPass: 'Demo@12345',
    demoName: 'Meera Deshpande (Manager)',
    target: '/app',
  },
  {
    key: 'AGENT',
    label: '🛵 Agent',
    title: 'Delivery Partner / Driver Login',
    sub: 'Doorstep 2-Opt sequenced morning rounds and offline delivery taps.',
    demoEmail: 'ravi@amrutdairy.in',
    demoPass: 'Demo@12345',
    demoName: 'Ravi Pawar (Agent)',
    target: '/app/my-round',
  },
];

export default function Login() {
  const { login: staffLogin } = useAuth();
  const { login: customerLogin } = useCustomerAuth();
  const { query } = useLocation();
  const toast = useToast();

  const [selectedRole, setSelectedRole] = useState('CUSTOMER');
  const [email, setEmail] = useState('9822011111');
  const [password, setPassword] = useState('Customer@123');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);

  const activeConfig = ROLES.find((r) => r.key === selectedRole) || ROLES[0];

  const handleRoleChange = (roleKey) => {
    setSelectedRole(roleKey);
    const config = ROLES.find((r) => r.key === roleKey);
    if (config) {
      setEmail(config.demoEmail);
      setPassword(config.demoPass);
      setFailure(null);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    setFailure(null);
    setBusy(true);

    try {
      if (selectedRole === 'CUSTOMER') {
        // Customer Auth Flow
        const isPriya = email.includes('2222') || email.toLowerCase().includes('priya');
        const customerData = {
          id: isPriya ? 2 : 1,
          name: isPriya ? 'Priya Sharma' : 'Sunil Joshi',
          phone: isPriya ? '9822022222' : (email.match(/\d{10}/)?.[0] || '9822011111'),
          email: email.includes('@') ? email : `${email}@routeledger.consumer`,
          address: isPriya ? 'Flat 101, Green Woods, Baner' : 'Flat 402, Rohan Heights, Kothrud',
        };
        customerLogin(customerData);
        toast.success(`Welcome to Customer Portal, ${customerData.name}!`);
        navigate('/customer', { replace: true });
      } else {
        // Operator Staff Auth Flow (Owner / Manager / Agent)
        const session = await staffLogin(email.trim().toLowerCase(), password);
        toast.success(`Welcome back, ${session.user.name.split(' ')[0]}.`);
        const target = query.next || (session.user.role === 'AGENT' ? '/app/my-round' : '/app');
        navigate(target, { replace: true });
      }
    } catch (error) {
      setFailure(error.message || 'Invalid credentials. Please verify your details.');
    } finally {
      setBusy(false);
    }
  };

  const handleQuickDemoFill = () => {
    setEmail(activeConfig.demoEmail);
    setPassword(activeConfig.demoPass);
    setFailure(null);
  };

  return (
    <div className={styles.wrap}>
      <section className={styles.panel}>
        <div className={styles.inner}>
          <Link to="/" className={styles.brand}>
            <span className={styles.mark} aria-hidden="true">
              RL
            </span>
            <span className={styles.brandName}>RouteLedger</span>
          </Link>

          {/* Role Selection Tabs */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 4,
              background: 'var(--surface-muted)',
              padding: 4,
              borderRadius: 'var(--r-md)',
              margin: 'var(--s-4) 0 var(--s-3)',
            }}
          >
            {ROLES.map((r) => (
              <button
                key={r.key}
                type="button"
                style={{
                  padding: 'var(--s-2) var(--s-1)',
                  fontSize: '0.8125rem',
                  fontWeight: selectedRole === r.key ? 700 : 500,
                  border: 'none',
                  borderRadius: 'var(--r-sm)',
                  background: selectedRole === r.key ? 'var(--surface)' : 'transparent',
                  color: selectedRole === r.key ? 'var(--text)' : 'var(--text-muted)',
                  boxShadow: selectedRole === r.key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  textAlign: 'center',
                }}
                onClick={() => handleRoleChange(r.key)}
              >
                {r.label}
              </button>
            ))}
          </div>

          <h1 className={styles.title}>{activeConfig.title}</h1>
          <p className={styles.sub}>{activeConfig.sub}</p>

          <form className={styles.form} onSubmit={submit} noValidate>
            {failure ? (
              <p className={styles.alert} role="alert">
                {failure}
              </p>
            ) : null}

            <Field
              label={selectedRole === 'CUSTOMER' ? 'Mobile Number / Customer ID' : 'Work email'}
              htmlFor="login-id"
            >
              <input
                id="login-id"
                className="input"
                type={selectedRole === 'CUSTOMER' ? 'text' : 'email'}
                autoComplete="username"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={selectedRole === 'CUSTOMER' ? 'e.g. 9822011111' : activeConfig.demoEmail}
              />
            </Field>

            <Field label="Password" htmlFor="password">
              <input
                id="password"
                className="input"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
              />
            </Field>

            <SubmitButton busy={busy} className="btn btn-primary btn-lg btn-block">
              Sign in as {selectedRole.toLowerCase()} →
            </SubmitButton>
          </form>

          {/* Registration link switcher */}
          <div style={{ margin: 'var(--s-4) 0', textAlign: 'center', fontSize: '0.875rem' }}>
            {selectedRole === 'CUSTOMER' ? (
              <p className={styles.swap} style={{ margin: 0 }}>
                New customer? <Link to="/customer/register"><b>Register Customer Account →</b></Link>
              </p>
            ) : (
              <p className={styles.swap} style={{ margin: 0 }}>
                New business? <Link to="/register"><b>Create Business Workspace →</b></Link>
              </p>
            )}
          </div>

          {/* Quick 1-Click Demo Section */}
          <div className={styles.demo} style={{ marginTop: 'var(--s-4)' }}>
            <div className="row spread" style={{ alignItems: 'center', marginBottom: 'var(--s-2)' }}>
              <div className={styles.demoHead} style={{ margin: 0 }}>
                ⚡ 1-Click Demo Login:
              </div>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                style={{ padding: '2px 8px', fontSize: '0.75rem' }}
                onClick={handleQuickDemoFill}
              >
                Reset Fields
              </button>
            </div>

            <div
              style={{
                background: 'rgba(255,255,255,0.06)',
                borderRadius: 'var(--r-sm)',
                padding: 'var(--s-3)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <b style={{ color: '#fff', fontSize: '0.875rem', display: 'block' }}>
                  {activeConfig.demoName}
                </b>
                <span className="hint" style={{ fontSize: '0.75rem' }}>
                  ID: {activeConfig.demoEmail} · Pass: {activeConfig.demoPass}
                </span>
              </div>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={submit}
              >
                Instant Sign In
              </button>
            </div>
          </div>
        </div>
      </section>

      <aside className={styles.proof}>
        <span className={styles.proofKicker}>RouteLedger Ecosystem</span>
        <h2 className={styles.proofTitle}>
          {selectedRole === 'CUSTOMER'
            ? 'Hyperlocal meal subscriptions without the WhatsApp chaos.'
            : 'A delivery round is a graph problem, not a WhatsApp group.'}
        </h2>
        <div className={styles.proofList}>
          <div className={styles.proofItem}>
            <span className={styles.proofNum}>1</span>
            <span className={styles.proofText}>
              <b>Advance Payment & Owner Approvals:</b> Customers pay upfront via UPI QR; owners verify and approve service before kitchen dispatch.
            </span>
          </div>
          <div className={styles.proofItem}>
            <span className={styles.proofNum}>2</span>
            <span className={styles.proofText}>
              <b>1-Tap Tomorrow Skips:</b> Customers skip tomorrow with one tap — money is preserved and credited forward.
            </span>
          </div>
          <div className={styles.proofItem}>
            <span className={styles.proofNum}>3</span>
            <span className={styles.proofText}>
              <b>2-Opt TSP Route Optimizer:</b> Morning delivery routes sequence themselves automatically from the kitchen depot to every doorstep.
            </span>
          </div>
        </div>
      </aside>
    </div>
  );
}
